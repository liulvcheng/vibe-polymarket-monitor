import { unzipSync, strFromU8 } from "fflate";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_COUNT = 1;
const DEFAULT_RETRY_DELAY_MS = 750;

// 拉取 Polymarket 公开数据的统一入口。
// 先从 profile 页面解析 proxyAddress，再并行抓取仓位列表和 accounting snapshot。
export async function fetchPolymarketAccountData({
  address,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryCount = DEFAULT_RETRY_COUNT,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}) {
  // fetchedAt 以抓取开始时间为准，后续快照、diff 和消息时间都基于这一刻。
  const fetchedAt = new Date().toISOString();
  const profileHtml = await fetchTextWithRetry({
    url: `https://polymarket.com/profile/${address}`,
    fetchImpl,
    timeoutMs,
    retryCount,
    retryDelayMs,
    accept: "text/html",
  });

  // Polymarket 前端展示仓位依赖 proxyAddress；直接用公开地址查 positions 可能拿不到完整结果。
  const { proxyAddress, username } = extractProfileMetadataFromHtml(profileHtml);
  const [accountingSnapshot, positionsPayload] = await Promise.all([
    fetchAccountingSnapshotWithRetry({
      url: `https://data-api.polymarket.com/v1/accounting/snapshot?user=${proxyAddress}`,
      fetchImpl,
      timeoutMs,
      retryCount,
      retryDelayMs,
    }),
    fetchAllPositions({
      proxyAddress,
      fetchImpl,
      timeoutMs,
      retryCount,
      retryDelayMs,
    }),
  ]);

  if (!Array.isArray(positionsPayload)) {
    throw new Error("Polymarket positions payload must be an array");
  }

  return {
    address,
    proxyAddress,
    username,
    fetchedAt,
    cashBalance: accountingSnapshot.cashBalance,
    positionsValue: accountingSnapshot.positionsValue,
    totalEquity: accountingSnapshot.equity,
    positions: positionsPayload,
  };
}

async function fetchAllPositions({
  proxyAddress,
  fetchImpl,
  timeoutMs,
  retryCount,
  retryDelayMs,
}) {
  const limit = 500;
  let offset = 0;
  const positions = [];

  while (true) {
    // positions 接口分页返回，直到某一页不足 limit 才说明已经取完。
    const page = await fetchJsonWithRetry({
      url:
        "https://data-api.polymarket.com/positions" +
        `?user=${proxyAddress}&sortBy=CURRENT&sortDirection=DESC&sizeThreshold=0&limit=${limit}&offset=${offset}`,
      fetchImpl,
      timeoutMs,
      retryCount,
      retryDelayMs,
    });

    if (!Array.isArray(page)) {
      throw new Error("Polymarket positions payload must be an array");
    }

    positions.push(...page);

    // 当前页数量少于 limit 说明已经到最后一页，继续翻页只会拿到空数组。
    if (page.length < limit) {
      return positions;
    }

    offset += limit;
  }
}

export function extractProfileMetadataFromHtml(html) {
  // 页面里的 __NEXT_DATA__ JSON 足够稳定，直接正则提取需要的最小字段即可。
  const proxyAddress =
    html.match(/"proxyAddress"\s*:\s*"(0x[a-fA-F0-9]{40})"/)?.[1];
  const username = html.match(/"username"\s*:\s*"([^"]+)"/)?.[1] ?? null;

  if (!proxyAddress) {
    throw new Error("Unable to resolve proxyAddress from Polymarket profile HTML");
  }

  return {
    proxyAddress: proxyAddress.toLowerCase(),
    username,
  };
}

async function fetchTextWithRetry(options) {
  return fetchWithRetry({
    ...options,
    parse: async (response) => response.text(),
  });
}

async function fetchJsonWithRetry(options) {
  return fetchWithRetry({
    ...options,
    parse: async (response) => response.json(),
  });
}

async function fetchAccountingSnapshotWithRetry(options) {
  return fetchWithRetry({
    ...options,
    accept: "application/zip",
    parse: async (response) => {
      const buffer = new Uint8Array(await response.arrayBuffer());
      return parseAccountingSnapshotZip(buffer);
    },
  });
}

async function fetchWithRetry({
  url,
  fetchImpl,
  timeoutMs,
  retryCount,
  retryDelayMs,
  accept = "application/json",
  parse,
}) {
  let lastError;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    // 超时后统一由 AbortController 打断请求，避免任务在 GitHub Actions 里长时间挂起。
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: accept,
          "User-Agent": "Mozilla/5.0 (compatible; vibe-polymarket-monitor/1.0)",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        // 非 2xx 直接视为失败，这样调用方不会在半残缺数据上继续执行。
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return await parse(response);
    } catch (error) {
      lastError = error;
      if (attempt === retryCount) {
        throw error;
      }

      // Polymarket 和 Telegram 的公网请求偶发抖动较多，这里只做一次轻量重试。
      await delay(retryDelayMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value) {
  const number = Number(value);
  // 数据源偶尔会返回空字符串或 null，这里统一拦住，避免后续计算 silently 变成 NaN。
  if (!Number.isFinite(number)) {
    throw new Error(`Expected numeric value, received: ${value}`);
  }

  return number;
}

function parseAccountingSnapshotZip(buffer) {
  const files = unzipSync(buffer);
  const equityCsv = files["equity.csv"];

  // equity.csv 是账户级摘要的唯一输入；缺失时宁可失败也不要猜测。
  if (!equityCsv) {
    throw new Error("Polymarket accounting snapshot is missing equity.csv");
  }

  const equityRows = parseCsv(strFromU8(equityCsv));
  if (equityRows.length === 0) {
    throw new Error("Polymarket accounting snapshot must contain at least one equity row");
  }

  const equityRow = equityRows
    .slice()
    // accounting zip 里可能带多行估值记录，统一取 valuationTime 最新的一行。
    .sort((left, right) => {
      const leftTime = Date.parse(left.valuationTime ?? "");
      const rightTime = Date.parse(right.valuationTime ?? "");

      if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
        // 如果时间戳异常，维持原顺序，至少不会因为 NaN 造成排序崩坏。
        return 0;
      }

      return rightTime - leftTime;
    })[0];

  return {
    cashBalance: roundCurrency(toNumber(equityRow.cashBalance)),
    positionsValue: roundCurrency(toNumber(equityRow.positionsValue)),
    equity: roundCurrency(toNumber(equityRow.equity)),
  };
}

function parseCsv(content) {
  const [headerLine, ...dataLines] = content.trim().split(/\r?\n/);
  const headers = headerLine.split(",");

  return dataLines
    .filter(Boolean)
    .map((line) => {
      // accounting csv 结构很简单，直接按逗号拆分即可；这里不引入更重的 CSV 解析器。
      const values = line.split(",");
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
}

function roundCurrency(value) {
  return Math.round(Number(value) * 100) / 100;
}

import { unzipSync, strFromU8 } from "fflate";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_COUNT = 1;
const DEFAULT_RETRY_DELAY_MS = 750;

export async function fetchPolymarketAccountData({
  address,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryCount = DEFAULT_RETRY_COUNT,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}) {
  const fetchedAt = new Date().toISOString();
  const profileHtml = await fetchTextWithRetry({
    url: `https://polymarket.com/profile/${address}`,
    fetchImpl,
    timeoutMs,
    retryCount,
    retryDelayMs,
    accept: "text/html",
  });
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

    if (page.length < limit) {
      return positions;
    }

    offset += limit;
  }
}

export function extractProfileMetadataFromHtml(html) {
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
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return await parse(response);
    } catch (error) {
      lastError = error;
      if (attempt === retryCount) {
        throw error;
      }

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
  if (!Number.isFinite(number)) {
    throw new Error(`Expected numeric value, received: ${value}`);
  }

  return number;
}

function parseAccountingSnapshotZip(buffer) {
  const files = unzipSync(buffer);
  const equityCsv = files["equity.csv"];

  if (!equityCsv) {
    throw new Error("Polymarket accounting snapshot is missing equity.csv");
  }

  const equityRows = parseCsv(strFromU8(equityCsv));
  if (equityRows.length === 0) {
    throw new Error("Polymarket accounting snapshot must contain at least one equity row");
  }

  const equityRow = equityRows
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(left.valuationTime ?? "");
      const rightTime = Date.parse(right.valuationTime ?? "");

      if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
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
      const values = line.split(",");
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
}

function roundCurrency(value) {
  return Math.round(Number(value) * 100) / 100;
}

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
  const [valuePayload, positionsPayload] = await Promise.all([
    fetchJsonWithRetry({
      url: `https://data-api.polymarket.com/value?user=${proxyAddress}`,
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

  if (!Array.isArray(valuePayload) || valuePayload.length === 0) {
    throw new Error("Polymarket value payload must be a non-empty array");
  }

  if (!Array.isArray(positionsPayload)) {
    throw new Error("Polymarket positions payload must be an array");
  }

  return {
    address,
    proxyAddress,
    username,
    fetchedAt,
    totalValue: toNumber(valuePayload[0]?.value),
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

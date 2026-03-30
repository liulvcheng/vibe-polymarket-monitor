export function buildSnapshot({
  address,
  proxyAddress,
  username,
  fetchedAt,
  totalValue,
  positions,
}) {
  return {
    address,
    proxyAddress,
    username,
    sentAt: fetchedAt,
    totalValue: roundCurrency(totalValue),
    positions: positions
      .map((position) => normalizePosition(position))
      .sort((left, right) => right.value - left.value),
  };
}

export function buildPositionKey(rawPosition) {
  if (rawPosition.conditionId && rawPosition.outcome) {
    return `${rawPosition.conditionId}::${rawPosition.outcome}`;
  }

  if (rawPosition.asset) {
    return rawPosition.asset;
  }

  throw new Error("Unable to build a stable position key");
}

function normalizePosition(rawPosition) {
  const shares = toNumber(rawPosition.size ?? rawPosition.shares);
  const avgPrice = toNumber(rawPosition.avgPrice);
  const currentPrice = toNumber(rawPosition.curPrice ?? rawPosition.currentPrice);
  const value = roundCurrency(rawPosition.currentValue ?? rawPosition.value);
  const costBasis = roundCurrency(
    rawPosition.initialValue ?? rawPosition.costBasis ?? shares * avgPrice,
  );
  const pnl = roundCurrency(rawPosition.cashPnl ?? rawPosition.pnl ?? value - costBasis);
  const pnlPercent = computePnlPercent(costBasis, pnl, rawPosition.percentPnl);

  return {
    id: buildPositionKey(rawPosition),
    asset: rawPosition.asset ?? null,
    conditionId: rawPosition.conditionId ?? null,
    market: rawPosition.title,
    slug: rawPosition.slug ?? null,
    eventSlug: rawPosition.eventSlug ?? null,
    outcome: rawPosition.outcome,
    shares,
    avgPrice,
    currentPrice,
    value,
    costBasis,
    pnl,
    pnlPercent,
    endDate: rawPosition.endDate ?? null,
    mergeable: Boolean(rawPosition.mergeable),
    negativeRisk: Boolean(rawPosition.negativeRisk),
  };
}

function computePnlPercent(costBasis, pnl, fallback) {
  if (Number.isFinite(Number(fallback))) {
    return Number(fallback);
  }

  if (costBasis === 0) {
    return null;
  }

  return (pnl / costBasis) * 100;
}

function toNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Expected numeric value, received: ${value}`);
  }

  return number;
}

function roundCurrency(value) {
  return Math.round(Number(value) * 100) / 100;
}

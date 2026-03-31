// 把 Polymarket 原始仓位响应标准化成内部快照结构。
// 这里顺带完成过滤和排序，避免格式化阶段再重复判断。
export function buildSnapshot({
  address,
  proxyAddress,
  username,
  fetchedAt,
  cashBalance,
  positionsValue,
  totalEquity,
  positions,
}) {
  const normalizedPositions = positions
    .map((position) => normalizePosition(position))
    .filter(isDisplayablePosition)
    // 展示时价值高的仓位排前面，消息阅读顺序也直接复用这里的排序结果。
    .sort((left, right) => right.value - left.value);

  return {
    address,
    proxyAddress,
    username,
    sentAt: fetchedAt,
    cashBalance: roundCurrency(cashBalance),
    positionsValue: roundCurrency(positionsValue),
    totalEquity: roundCurrency(totalEquity),
    // totalValue 只统计最终会展示的 active positions，和消息中的 Open Positions Value 保持一致。
    totalValue: roundCurrency(normalizedPositions.reduce((sum, position) => sum + position.value, 0)),
    positions: normalizedPositions,
  };
}

export function buildPositionKey(rawPosition) {
  // 优先使用 conditionId + outcome 作为稳定主键。
  // 这样同一市场的 Yes/No 两侧能在前后快照中稳定对应。
  if (rawPosition.conditionId && rawPosition.outcome) {
    return `${rawPosition.conditionId}::${rawPosition.outcome}`;
  }

  if (rawPosition.asset) {
    return rawPosition.asset;
  }

  throw new Error("Unable to build a stable position key");
}

function normalizePosition(rawPosition) {
  // Polymarket 不同接口和不同阶段的字段名略有差异，这里统一收敛到内部模型。
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
    redeemable: Boolean(rawPosition.redeemable),
    mergeable: Boolean(rawPosition.mergeable),
    negativeRisk: Boolean(rawPosition.negativeRisk),
  };
}

function isDisplayablePosition(position) {
  // 展示层只保留仍然有实际持仓价值、且尚未 redeem 的仓位。
  if (roundQuantity(position.shares) <= 0) {
    return false;
  }

  if (roundCurrency(position.value) <= 0) {
    return false;
  }

  if (position.redeemable) {
    // redeemable 通常代表市场已结算或仓位已可赎回，这类仓位不应继续混在 active 列表中。
    return false;
  }

  return true;
}

function computePnlPercent(costBasis, pnl, fallback) {
  // 只要上游已经给出 percentPnl，就优先信任原始值，避免二次计算引入微小偏差。
  if (Number.isFinite(Number(fallback))) {
    return Number(fallback);
  }

  // 成本为 0 时百分比没有意义，显式返回 null 交给格式化层展示 N/A。
  if (costBasis === 0) {
    return null;
  }

  return (pnl / costBasis) * 100;
}

function toNumber(value) {
  const number = Number(value);
  // 在标准化入口统一拒绝非法数字，避免坏数据在后面几层才爆出更难定位的问题。
  if (!Number.isFinite(number)) {
    throw new Error(`Expected numeric value, received: ${value}`);
  }

  return number;
}

function roundCurrency(value) {
  return Math.round(Number(value) * 100) / 100;
}

function roundQuantity(value) {
  return Math.round(Number(value) * 100) / 100;
}

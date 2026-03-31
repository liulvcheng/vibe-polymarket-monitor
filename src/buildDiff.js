// 只比较 current 和 prev1。
// 输出同时包含总仓位变化、每个仓位的变化，以及自上次以来消失的仓位列表。
export function buildDiff({ current, prev1 }) {
  const prev1Map = buildPositionMap(prev1?.positions ?? []);
  const positions = current.positions.map((position) =>
    withDeltas({
      currentPosition: position,
      prev1Position: prev1Map.get(position.id),
      hasPrev1: Boolean(prev1),
    }),
  );

  return {
    summary: {
      activePositions: current.positions.length,
      deltaValuePrev1: deltaNumber(current.totalValue, prev1?.totalValue),
    },
    positions,
    // prev1 里有、current 里没有的仓位，统一视为“自上次以来已关闭或不再 active”。
    closedSincePrev1: (prev1?.positions ?? []).filter(
      (position) => !current.positions.some((currentPosition) => currentPosition.id === position.id),
    ),
  };
}

function buildPositionMap(positions) {
  return new Map(positions.map((position) => [position.id, position]));
}

function withDeltas({
  currentPosition,
  prev1Position,
  hasPrev1,
}) {
  return {
    ...currentPosition,
    deltaValuePrev1: deltaPositionField(
      currentPosition.value,
      prev1Position?.value,
      hasPrev1,
    ),
    deltaPricePrev1: deltaPositionField(
      currentPosition.currentPrice,
      prev1Position?.currentPrice,
      hasPrev1,
    ),
    deltaSharesPrev1: deltaPositionField(
      currentPosition.shares,
      prev1Position?.shares,
      hasPrev1,
    ),
  };
}

function deltaPositionField(currentValue, previousValue, hasPreviousSnapshot) {
  // 首次运行没有比较基线，消息里应该展示 N/A 而不是 0。
  if (!hasPreviousSnapshot) {
    return null;
  }

  // prev1 不存在该仓位时，显式标成 NEW，方便和数值变化区分。
  if (previousValue == null) {
    return "NEW";
  }

  return roundNumber(currentValue - previousValue);
}

function deltaNumber(currentValue, previousValue) {
  if (previousValue == null) {
    return null;
  }

  return roundNumber(currentValue - previousValue);
}

function roundNumber(value) {
  return Math.round(value * 100) / 100;
}

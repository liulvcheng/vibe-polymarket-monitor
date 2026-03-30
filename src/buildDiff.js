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
  if (!hasPreviousSnapshot) {
    return null;
  }

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

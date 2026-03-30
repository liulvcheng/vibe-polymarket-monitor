export function buildDiff({ current, prev1, prev2 }) {
  const prev1Map = buildPositionMap(prev1?.positions ?? []);
  const prev2Map = buildPositionMap(prev2?.positions ?? []);
  const positions = current.positions.map((position) =>
    withDeltas({
      currentPosition: position,
      prev1Position: prev1Map.get(position.id),
      prev2Position: prev2Map.get(position.id),
      hasPrev1: Boolean(prev1),
      hasPrev2: Boolean(prev2),
    }),
  );

  return {
    summary: {
      activePositions: current.positions.length,
      deltaValuePrev1: deltaNumber(current.totalValue, prev1?.totalValue),
      deltaValuePrev2: deltaNumber(current.totalValue, prev2?.totalValue),
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
  prev2Position,
  hasPrev1,
  hasPrev2,
}) {
  return {
    ...currentPosition,
    deltaValuePrev1: deltaPositionField(
      currentPosition.value,
      prev1Position?.value,
      hasPrev1,
    ),
    deltaValuePrev2: deltaPositionField(
      currentPosition.value,
      prev2Position?.value,
      hasPrev2,
    ),
    deltaPricePrev1: deltaPositionField(
      currentPosition.currentPrice,
      prev1Position?.currentPrice,
      hasPrev1,
    ),
    deltaPricePrev2: deltaPositionField(
      currentPosition.currentPrice,
      prev2Position?.currentPrice,
      hasPrev2,
    ),
    deltaSharesPrev1: deltaPositionField(
      currentPosition.shares,
      prev1Position?.shares,
      hasPrev1,
    ),
    deltaSharesPrev2: deltaPositionField(
      currentPosition.shares,
      prev2Position?.shares,
      hasPrev2,
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

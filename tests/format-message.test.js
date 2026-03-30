import test from "node:test";
import assert from "node:assert/strict";

import { formatMonitorMessages } from "../src/format-message.js";

const snapshot = {
  address: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
  username: "0utr1",
  sentAt: "2026-03-31T00:00:00.000Z",
  totalValue: 150,
  positions: [
    {
      id: "condition-1::Yes",
      market: "Market A",
      outcome: "Yes",
      shares: 100,
      avgPrice: 0.61,
      currentPrice: 0.75,
      value: 75,
      costBasis: 61,
      pnl: 14,
      pnlPercent: 22.95,
      endDate: "2026-12-31",
    },
  ],
};

const diff = {
  summary: {
    activePositions: 1,
    deltaValuePrev1: 10,
    deltaValuePrev2: null,
  },
  positions: [
    {
      ...snapshot.positions[0],
      deltaValuePrev1: 12,
      deltaValuePrev2: null,
      deltaPricePrev1: 0.05,
      deltaPricePrev2: null,
      deltaSharesPrev1: 10,
      deltaSharesPrev2: null,
    },
  ],
  closedSincePrev1: [],
};

test("formatMonitorMessages renders summary and position details", () => {
  const messages = formatMonitorMessages({
    snapshot,
    diff,
    timezone: "Asia/Shanghai",
    maxLength: 3500,
  });

  assert.equal(messages.length, 1);
  assert.match(messages[0], /PM Monitor/);
  assert.match(messages[0], /Total Value: \$150\.00/);
  assert.match(messages[0], /Market A/);
  assert.match(messages[0], /Side: Yes/);
  assert.match(messages[0], /dValue: prev1 \+\$12\.00 \| prev2 N\/A/);
});

test("formatMonitorMessages splits long outputs into multiple parts", () => {
  const messages = formatMonitorMessages({
    snapshot: {
      ...snapshot,
      positions: Array.from({ length: 20 }, (_, index) => ({
        ...snapshot.positions[0],
        id: `position-${index}`,
        market: `Long Market ${index + 1}`.padEnd(80, "x"),
      })),
    },
    diff: {
      ...diff,
      positions: Array.from({ length: 20 }, (_, index) => ({
        ...diff.positions[0],
        id: `position-${index}`,
        market: `Long Market ${index + 1}`.padEnd(80, "x"),
      })),
    },
    timezone: "Asia/Shanghai",
    maxLength: 800,
  });

  assert.ok(messages.length > 1);
  assert.match(messages[0], /Part 1\/\d+/);
  assert.match(messages[1], /Part 2\/\d+/);
});

import test from "node:test";
import assert from "node:assert/strict";

import { formatMonitorMessages } from "../src/formatMessage.js";

const snapshot = {
  address: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
  username: "0utr1",
  sentAt: "2026-03-31T00:00:00.000Z",
  cashBalance: 35,
  totalEquity: 185,
  totalValue: 150,
  positions: [
    {
      id: "condition-1::Yes",
      market: "EdgeX FDV above $1B one day after launch?",
      outcome: "Yes",
      shares: 100,
      avgPrice: 0.61,
      currentPrice: 0.75,
      value: 75,
      costBasis: 61,
      pnl: 14,
      pnlPercent: 22.95,
      endDate: "2026-12-31",
      eventSlug: "edgex-fdv-above-one-day-after-launch",
    },
  ],
};

const diff = {
  summary: {
    activePositions: 1,
    deltaValuePrev1: 10,
  },
  positions: [
    {
      ...snapshot.positions[0],
      deltaValuePrev1: 12,
      deltaPricePrev1: 0.05,
      deltaSharesPrev1: 10,
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
  assert.match(
    messages[0],
    /Polymarket Profile:\nhttps:\/\/polymarket\.com\/profile\/0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f/,
  );
  assert.match(messages[0], /Open Positions Value: \$150\.00/);
  assert.match(messages[0], /Available Cash: \$35\.00/);
  assert.match(messages[0], /Total Equity: \$185\.00/);
  assert.doesNotMatch(messages[0], /Delta vs prev2/);
  assert.match(messages[0], /<b>EdgeX FDV Above One Day After Launch<\/b>/);
  assert.match(messages[0], /<b>1\. EdgeX FDV above \$1B one day after launch\?<\/b>/);
  assert.match(messages[0], /Side: Yes\n/);
  assert.match(messages[0], /Value: \$75\.00\n/);
  assert.match(messages[0], /PnL: \+\$14\.00 \(\+22\.95%\)\n/);
  assert.match(messages[0], /Shares: 100\n/);
  assert.match(messages[0], /Avg: 61c\n/);
  assert.match(messages[0], /Now: 75c\n/);
  assert.match(messages[0], /Cost: \$61\.00\n/);
  assert.match(messages[0], /dValue: \+\$12\.00\n/);
  assert.match(messages[0], /dPrice: \+5c\n/);
  assert.match(messages[0], /dShares: \+10\n/);
  assert.match(messages[0], /End: 2026-12-31/);
});

test("formatMonitorMessages groups and sorts positions by market value then position value", () => {
  const messages = formatMonitorMessages({
    snapshot: {
      ...snapshot,
      positions: [
        {
          ...snapshot.positions[0],
          id: "condition-2::No",
          market: "Will Lighter reach $4 before 2027?",
          outcome: "No",
          eventSlug: "will-lighter-reach-before-2027",
          value: 30,
        },
        snapshot.positions[0],
        {
          ...snapshot.positions[0],
          id: "condition-3::Yes",
          market: "EdgeX FDV above $300M one day after launch?",
          eventSlug: "edgex-fdv-above-one-day-after-launch",
          value: 120,
        },
      ],
    },
    diff: {
      ...diff,
      summary: {
        ...diff.summary,
        activePositions: 3,
      },
      positions: [
        {
          ...diff.positions[0],
          id: "condition-2::No",
          market: "Will Lighter reach $4 before 2027?",
          outcome: "No",
          eventSlug: "will-lighter-reach-before-2027",
          value: 30,
        },
        diff.positions[0],
        {
          ...diff.positions[0],
          id: "condition-3::Yes",
          market: "EdgeX FDV above $300M one day after launch?",
          eventSlug: "edgex-fdv-above-one-day-after-launch",
          value: 120,
        },
      ],
    },
    timezone: "Asia/Shanghai",
    maxLength: 3500,
  });

  const edgeXGroupIndex = messages[0].indexOf("<b>EdgeX FDV Above One Day After Launch</b>");
  const lighterGroupIndex = messages[0].indexOf("<b>Will Lighter Reach Before 2027</b>");
  const higherValueIndex = messages[0].indexOf("<b>1. EdgeX FDV above $300M one day after launch?</b>");
  const lowerValueIndex = messages[0].indexOf("<b>2. EdgeX FDV above $1B one day after launch?</b>");

  assert.ok(edgeXGroupIndex !== -1);
  assert.ok(lighterGroupIndex !== -1);
  assert.ok(edgeXGroupIndex < lighterGroupIndex);
  assert.ok(higherValueIndex < lowerValueIndex);
  assert.match(
    messages[0],
    /<b>EdgeX FDV Above One Day After Launch<\/b>\n\n<b>1\. EdgeX FDV above \$300M one day after launch\?<\/b>/,
  );
  assert.match(messages[0], /dShares: \+10\nEnd: 2026-12-31\n\n<b>2\. EdgeX FDV above \$1B one day after launch\?<\/b>/);
  assert.match(messages[0], /dShares: \+10\nEnd: 2026-12-31\n\n<b>Will Lighter Reach Before 2027<\/b>/);
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

test("formatMonitorMessages hides deprecated closed positions with zero last value", () => {
  const messages = formatMonitorMessages({
    snapshot,
    diff: {
      ...diff,
      closedSincePrev1: [
        {
          market: "Market Kept",
          outcome: "Yes",
          value: 12.34,
        },
        {
          market: "EdgeX FDV above $700M one day after launch?",
          outcome: "Yes",
          value: 0,
        },
      ],
    },
    timezone: "Asia/Shanghai",
    maxLength: 3500,
  });

  assert.match(messages[0], /Closed or not active since prev1:/);
  assert.match(messages[0], /- Market Kept; Yes; Last Value \$12\.34/);
  assert.doesNotMatch(messages[0], /EdgeX FDV above \$700M one day after launch\?/);
  assert.doesNotMatch(messages[0], /Last Value \$0\.00/);
});

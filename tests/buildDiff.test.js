import test from "node:test";
import assert from "node:assert/strict";

import { buildDiff } from "../src/buildDiff.js";

// These fixtures keep the diff cases small enough to reason about by inspection.
const current = {
  totalValue: 150,
  positions: [
    {
      id: "condition-1::Yes",
      market: "Market A",
      outcome: "Yes",
      shares: 100,
      currentPrice: 0.75,
      value: 75,
    },
    {
      id: "condition-2::No",
      market: "Market B",
      outcome: "No",
      shares: 50,
      currentPrice: 0.5,
      value: 25,
    },
  ],
};

const prev1 = {
  totalValue: 140,
  positions: [
    {
      id: "condition-1::Yes",
      market: "Market A",
      outcome: "Yes",
      shares: 90,
      currentPrice: 0.7,
      value: 63,
    },
    {
      id: "condition-3::Yes",
      market: "Market C",
      outcome: "Yes",
      shares: 10,
      currentPrice: 0.2,
      value: 2,
    },
  ],
};

test("buildDiff marks first run values as unavailable", () => {
  const diff = buildDiff({ current, prev1: null });

  assert.equal(diff.summary.deltaValuePrev1, null);
  assert.equal(diff.positions[0].deltaValuePrev1, null);
  assert.equal(diff.positions[1].deltaValuePrev1, null);
  assert.deepEqual(diff.closedSincePrev1, []);
});

test("buildDiff computes portfolio and per-position deltas", () => {
  const diff = buildDiff({ current, prev1 });
  const marketA = diff.positions.find((position) => position.id === "condition-1::Yes");
  const marketB = diff.positions.find((position) => position.id === "condition-2::No");

  assert.equal(diff.summary.deltaValuePrev1, 10);
  assert.equal(marketA.deltaValuePrev1, 12);
  assert.equal(marketA.deltaSharesPrev1, 10);
  assert.equal(marketA.deltaPricePrev1, 0.05);
  assert.equal(marketB.deltaValuePrev1, "NEW");
  assert.equal(diff.closedSincePrev1.length, 1);
  assert.equal(diff.closedSincePrev1[0].market, "Market C");
});

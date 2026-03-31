import test from "node:test";
import assert from "node:assert/strict";

import { buildPositionKey, buildSnapshot } from "../src/buildSnapshot.js";

const rawPositions = [
  {
    asset: "asset-1",
    conditionId: "condition-1",
    size: 100,
    avgPrice: 0.61,
    initialValue: 61,
    currentValue: 75,
    cashPnl: 14,
    percentPnl: 22.95,
    curPrice: 0.75,
    title: "Market A",
    slug: "market-a",
    eventSlug: "event-a",
    outcome: "Yes",
    endDate: "2026-12-31",
    mergeable: false,
    negativeRisk: false,
  },
  {
    asset: "asset-2",
    conditionId: "condition-2",
    size: 50,
    avgPrice: 0.2,
    initialValue: 10,
    currentValue: 12.5,
    cashPnl: 2.5,
    percentPnl: 25,
    curPrice: 0.25,
    title: "Market B",
    slug: "market-b",
    eventSlug: "event-b",
    outcome: "No",
    endDate: "2027-01-01",
    mergeable: true,
    negativeRisk: true,
  },
];

test("buildPositionKey uses condition and outcome when available", () => {
  assert.equal(
    buildPositionKey({
      conditionId: "condition-1",
      outcome: "Yes",
      asset: "asset-1",
    }),
    "condition-1::Yes",
  );
});

test("buildSnapshot normalizes and sorts positions by value descending", () => {
  const snapshot = buildSnapshot({
    address: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
    proxyAddress: "0xe48a00a7eaec1977fa9f72af4422c1628367dc27",
    username: "0utr1",
    fetchedAt: "2026-03-31T00:00:00.000Z",
    cashBalance: 12.5,
    positionsValue: 87.5,
    totalEquity: 100,
    positions: rawPositions,
  });

  assert.equal(snapshot.positions.length, 2);
  assert.equal(snapshot.cashBalance, 12.5);
  assert.equal(snapshot.totalEquity, 100);
  assert.equal(snapshot.totalValue, 87.5);
  assert.equal(snapshot.positions[0].market, "Market A");
  assert.equal(snapshot.positions[1].market, "Market B");
  assert.equal(snapshot.positions[0].costBasis, 61);
  assert.equal(snapshot.positions[0].pnl, 14);
  assert.equal(snapshot.positions[1].mergeable, true);
  assert.equal(snapshot.positions[1].negativeRisk, true);
});

test("buildSnapshot derives missing cost basis and pnl values", () => {
  const snapshot = buildSnapshot({
    address: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
    proxyAddress: "0xe48a00a7eaec1977fa9f72af4422c1628367dc27",
    username: "0utr1",
    fetchedAt: "2026-03-31T00:00:00.000Z",
    cashBalance: 25,
    positionsValue: 75,
    totalEquity: 100,
    positions: [
      {
        asset: "asset-1",
        conditionId: "condition-1",
        size: 100,
        avgPrice: 0.61,
        currentValue: 75,
        curPrice: 0.75,
        title: "Market A",
        outcome: "Yes",
      },
    ],
  });

  assert.equal(snapshot.positions[0].costBasis, 61);
  assert.equal(snapshot.positions[0].pnl, 14);
});

test("buildSnapshot filters zero-share and redeemable positions but keeps valued non-redeemable ended positions", () => {
  const snapshot = buildSnapshot({
    address: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
    proxyAddress: "0xe48a00a7eaec1977fa9f72af4422c1628367dc27",
    username: "0utr1",
    fetchedAt: "2026-03-31T00:00:00.000Z",
    cashBalance: 10,
    positionsValue: 101,
    totalEquity: 111,
    positions: [
      rawPositions[0],
      { ...rawPositions[1], size: 0 },
      { ...rawPositions[1], asset: "asset-3", conditionId: "condition-3", redeemable: true },
      { ...rawPositions[1], asset: "asset-4", conditionId: "condition-4", endDate: "2025-01-01" },
    ],
  });

  assert.equal(snapshot.positions.length, 2);
  assert.equal(snapshot.positions[0].market, "Market A");
  assert.equal(snapshot.positions[1].market, "Market B");
  assert.equal(snapshot.totalValue, 87.5);
});

test("buildSnapshot filters positions that round to zero shares or zero value", () => {
  const snapshot = buildSnapshot({
    address: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
    proxyAddress: "0xe48a00a7eaec1977fa9f72af4422c1628367dc27",
    username: "0utr1",
    fetchedAt: "2026-03-31T00:00:00.000Z",
    cashBalance: 10,
    positionsValue: 101,
    totalEquity: 111,
    positions: [
      rawPositions[0],
      {
        ...rawPositions[1],
        asset: "asset-5",
        conditionId: "condition-5",
        size: 0.004,
        currentValue: 0.004,
        initialValue: 0.004,
      },
    ],
  });

  assert.equal(snapshot.positions.length, 1);
  assert.equal(snapshot.positions[0].market, "Market A");
});

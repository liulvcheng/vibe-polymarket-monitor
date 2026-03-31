import { strToU8, zipSync } from "fflate";

// Build an in-memory zip that matches the accounting snapshot shape used by fetchPm tests.
export function buildAccountingSnapshotZip({
  equityRows = [],
  positionRows = [],
}) {
  const equityCsv = toCsv([
    ["cashBalance", "positionsValue", "equity", "valuationTime"],
    ...equityRows,
  ]);
  const positionsCsv = toCsv([
    ["conditionId", "asset", "size", "curPrice", "valuationTime"],
    ...positionRows,
  ]);

  return zipSync({
    "equity.csv": strToU8(equityCsv),
    "positions.csv": strToU8(positionsCsv),
  });
}

function toCsv(rows) {
  return `${rows.map((row) => row.join(",")).join("\n")}\n`;
}

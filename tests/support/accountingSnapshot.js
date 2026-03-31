import { strToU8, zipSync } from "fflate";

// 生成一个内存中的 accounting snapshot zip。
// fetchPm 测试通过它模拟 Polymarket 下载回来的压缩包结构。
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

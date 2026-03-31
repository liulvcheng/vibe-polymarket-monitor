const DEFAULT_MAX_LENGTH = 3500;

export function formatMonitorMessages({
  snapshot,
  diff,
  timezone,
  maxLength = DEFAULT_MAX_LENGTH,
}) {
  const profileUrl = `https://polymarket.com/profile/${snapshot.address}`;
  const summaryBlock = [
    "PM Monitor",
    "Polymarket Profile:",
    profileUrl,
    `Account: ${snapshot.username ? `@${snapshot.username}` : shortAddress(snapshot.address)} (${shortAddress(snapshot.address)})`,
    `Time: ${formatDateTime(snapshot.sentAt, timezone)}`,
    `Open Positions Value: ${formatMoney(snapshot.totalValue)}`,
    `Available Cash: ${formatMoney(snapshot.cashBalance)}`,
    `Total Equity: ${formatMoney(snapshot.totalEquity)}`,
    `Open Value Delta vs prev1: ${formatDeltaMoney(diff.summary.deltaValuePrev1)}`,
    `Active Positions: ${diff.summary.activePositions}`,
    "",
    "",
  ].join("\n");

  const positionBlocks = diff.positions.map((position, index) =>
    [
      `${index + 1}. ${position.market}`,
      `Side: ${position.outcome}; Shares: ${formatShares(position.shares)}; Avg: ${formatCents(position.avgPrice)}; Now: ${formatCents(position.currentPrice)}`,
      `Value: ${formatMoney(position.value)}; Cost: ${formatMoney(position.costBasis)}; PnL: ${formatDeltaMoney(position.pnl)} (${formatPercent(position.pnlPercent)})`,
      `dValue ${formatDeltaMoney(position.deltaValuePrev1)}; dPrice ${formatDeltaCents(position.deltaPricePrev1)}; dShares ${formatDeltaShares(position.deltaSharesPrev1)}${buildOptionalSuffix(position, 1)}`,
      "",
      "",
    ].join("\n"),
  );

  const closedBlock =
    diff.closedSincePrev1.length === 0
      ? []
      : [
          "Closed or not active since prev1:",
          ...diff.closedSincePrev1.map(
            (position) =>
              `- ${position.market}; ${position.outcome}; Last Value ${formatMoney(position.value)}`,
          ),
          "",
        ];

  const parts = splitBlocksIntoMessages({
    summaryBlock,
    positionBlocks,
    closedBlock: closedBlock.join("\n"),
    maxLength,
  });

  if (parts.length === 1) {
    return parts;
  }

  return parts.map((message, index) => `Part ${index + 1}/${parts.length}\n\n${message}`);
}

function splitBlocksIntoMessages({ summaryBlock, positionBlocks, closedBlock, maxLength }) {
  const messages = [];
  let current = summaryBlock;

  for (const block of positionBlocks) {
    if ((current + block).length > maxLength && current !== summaryBlock) {
      messages.push(current.trimEnd());
      current = block;
      continue;
    }

    if ((current + block).length > maxLength) {
      messages.push(current.trimEnd());
      current = block;
      continue;
    }

    current += block;
  }

  if (closedBlock) {
    if ((current + closedBlock).length > maxLength) {
      messages.push(current.trimEnd());
      current = closedBlock;
    } else {
      current += closedBlock;
    }
  }

  if (current.trim()) {
    messages.push(current.trimEnd());
  }

  return messages;
}

function formatDateTime(value, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatMoney(value) {
  if (typeof value !== "number") {
    return "N/A";
  }

  const sign = value >= 0 ? "" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatDeltaMoney(value) {
  if (value == null) {
    return "N/A";
  }

  if (value === "NEW") {
    return "NEW";
  }

  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}

function formatCents(value) {
  return `${(value * 100).toFixed(1).replace(/\.0$/, "")}c`;
}

function formatDeltaCents(value) {
  if (value == null) {
    return "N/A";
  }

  if (value === "NEW") {
    return "NEW";
  }

  return `${value >= 0 ? "+" : "-"}${(Math.abs(value) * 100).toFixed(1).replace(/\.0$/, "")}c`;
}

function formatDeltaShares(value) {
  if (value == null) {
    return "N/A";
  }

  if (value === "NEW") {
    return "NEW";
  }

  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(2).replace(/\.00$/, "")}`;
}

function formatShares(value) {
  return value.toFixed(2).replace(/\.00$/, "");
}

function formatPercent(value) {
  if (value == null) {
    return "N/A";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function buildOptionalSuffix(position, fieldsInLine = 0) {
  const parts = [];

  if (position.endDate) {
    parts.push(`End: ${position.endDate}`);
  }

  if (position.mergeable) {
    parts.push("Mergeable: yes");
  }

  if (position.negativeRisk) {
    parts.push("Negative risk: yes");
  }

  if (parts.length === 0) {
    return "";
  }

  if (fieldsInLine >= 4) {
    return `\n${parts.join("; ")}`;
  }

  return `; ${parts.join("; ")}`;
}

function shortAddress(value) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

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
    escapeHtml(profileUrl),
    `Account: ${escapeHtml(snapshot.username ? `@${snapshot.username}` : shortAddress(snapshot.address))} (${escapeHtml(shortAddress(snapshot.address))})`,
    `Time: ${formatDateTime(snapshot.sentAt, timezone)}`,
    `Open Positions Value: ${formatMoney(snapshot.totalValue)}`,
    `Available Cash: ${formatMoney(snapshot.cashBalance)}`,
    `Total Equity: ${formatMoney(snapshot.totalEquity)}`,
    `Open Value Delta vs prev1: ${formatDeltaMoney(diff.summary.deltaValuePrev1)}`,
    `Active Positions: ${diff.summary.activePositions}`,
    "",
    "",
  ].join("\n");

  const groupedBlocks = buildGroupedBlocks(diff.positions);

  const closedBlock =
    diff.closedSincePrev1.filter(isDisplayableClosedPosition).length === 0
      ? []
      : [
          "Closed or not active since prev1:",
          ...diff.closedSincePrev1.filter(isDisplayableClosedPosition).map(
            (position) =>
              `- ${escapeHtml(position.market)}; ${escapeHtml(position.outcome)}; Last Value ${formatMoney(position.value)}`,
          ),
          "",
        ];

  const parts = splitBlocksIntoMessages({
    summaryBlock,
    positionBlocks: groupedBlocks,
    closedBlock: closedBlock.join("\n"),
    maxLength,
  });

  if (parts.length === 1) {
    return parts;
  }

  return parts.map((message, index) => `Part ${index + 1}/${parts.length}\n\n${message}`);
}

function buildGroupedBlocks(positions) {
  const groups = Array.from(groupPositions(positions).values()).sort(
    (left, right) => right.totalValue - left.totalValue,
  );

  return groups.map((group) =>
    [
      `<b>${escapeHtml(group.title)}</b>`,
      ...group.positions.map((position, index) => buildPositionBlock(position, index + 1)),
    ].join("\n"),
  );
}

function groupPositions(positions) {
  const groups = new Map();

  for (const position of positions) {
    const key = position.eventSlug ?? position.slug ?? position.market;
    const title = buildGroupTitle(position);
    const existing = groups.get(key);

    if (existing) {
      existing.positions.push(position);
      existing.totalValue += position.value;
      continue;
    }

    groups.set(key, {
      key,
      title,
      totalValue: position.value,
      positions: [position],
    });
  }

  for (const group of groups.values()) {
    group.positions.sort((left, right) => right.value - left.value);
  }

  return groups;
}

function buildGroupTitle(position) {
  if (position.eventSlug) {
    return titleCaseSlug(position.eventSlug);
  }

  return position.market;
}

function buildPositionBlock(position, index) {
  const lines = [
    `<b>${index}. ${escapeHtml(position.market)}</b>`,
    `Side: ${escapeHtml(position.outcome)}`,
    `Value: ${formatMoney(position.value)}`,
    `PnL: ${formatDeltaMoney(position.pnl)} (${formatPercent(position.pnlPercent)})`,
    `Shares: ${formatShares(position.shares)}`,
    `Avg: ${formatCents(position.avgPrice)}`,
    `Now: ${formatCents(position.currentPrice)}`,
    `Cost: ${formatMoney(position.costBasis)}`,
    `dValue: ${formatDeltaMoney(position.deltaValuePrev1)}`,
    `dPrice: ${formatDeltaCents(position.deltaPricePrev1)}`,
    `dShares: ${formatDeltaShares(position.deltaSharesPrev1)}`,
  ];

  if (position.endDate) {
    lines.push(`End: ${escapeHtml(position.endDate)}`);
  }

  if (position.mergeable) {
    lines.push("Mergeable: yes");
  }

  if (position.negativeRisk) {
    lines.push("Negative risk: yes");
  }

  lines.push("");
  return lines.join("\n");
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

function isDisplayableClosedPosition(position) {
  return typeof position?.value === "number" && position.value > 0;
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

function shortAddress(value) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function titleCaseSlug(value) {
  const tokenMap = new Map([
    ["edgex", "EdgeX"],
    ["megaeth", "MegaETH"],
    ["fogo", "Fogo"],
    ["fdv", "FDV"],
  ]);

  return value
    .split("-")
    .map((part) => {
      const normalizedPart = part.toLowerCase();

      if (tokenMap.has(normalizedPart)) {
        return tokenMap.get(normalizedPart);
      }

      if (/^\$?\d/.test(part)) {
        return part.toUpperCase();
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

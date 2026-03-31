const DEFAULT_MAX_LENGTH = 3500;

// 把内部快照和 diff 渲染成 Telegram HTML 消息。
// 格式化阶段负责分组、排序、空行排版，以及超长消息拆分。
export function formatMonitorMessages({
  snapshot,
  diff,
  timezone,
  maxLength = DEFAULT_MAX_LENGTH,
}) {
  const profileUrl = `https://polymarket.com/profile/${snapshot.address}`;
  // summaryBlock 始终放在第一条消息开头，方便在 Telegram 列表页直接看到核心信息。
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

  // 已关闭列表只保留最后价值仍大于 0 的仓位。
  // 这样可以避免把“上次就是 0”的历史垃圾项继续展示出来。
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

  // 分片后补上 part 标记，避免用户误以为消息内容被截断。
  return parts.map((message, index) => `Part ${index + 1}/${parts.length}\n\n${message}`);
}

function buildGroupedBlocks(positions) {
  const groups = Array.from(groupPositions(positions).values()).sort(
    // 市场块按总价值降序，优先把影响最大的市场放到上面。
    (left, right) => right.totalValue - left.totalValue,
  );

  return groups.map((group) =>
    [
      `<b>${escapeHtml(group.title)}</b>`,
      "",
      // 市场标题后保留一个空行；每个仓位块自身末尾也保留空行，方便在手机上快速扫读。
      ...group.positions.map((position, index) => buildPositionBlock(position, index + 1)),
      "",
    ].join("\n"),
  );
}

function groupPositions(positions) {
  const groups = new Map();

  for (const position of positions) {
    // 优先按 eventSlug 分组，这样同一事件下的多个预测会折叠到同一市场块里。
    // 如果没有 eventSlug，再退回 slug 或市场标题。
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
    // 同一市场内的多个预测也按单仓位价值降序，减少来回扫读成本。
    group.positions.sort((left, right) => right.value - left.value);
  }

  return groups;
}

function buildGroupTitle(position) {
  // eventSlug 更适合作为市场分组标题；没有时再退回单个仓位标题。
  if (position.eventSlug) {
    return titleCaseSlug(position.eventSlug);
  }

  return position.market;
}

function buildPositionBlock(position, index) {
  // 每个指标独立一行，优先保证手机上可扫读，而不是压缩成更短的单行格式。
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

  // mergeable / negativeRisk 只在为 true 时展示，避免给普通仓位增加无效噪音。
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
    // 只在完整块之间拆分，避免把一个市场或一个仓位截断到两条 Telegram 消息里。
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
    // 已关闭列表总是作为一个整体追加，避免用户在不同分片里来回找。
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
  // 最后一笔价值为 0 的已关闭仓位通常没有信息量，直接隐藏。
  return typeof position?.value === "number" && position.value > 0;
}

function formatDateTime(value, timezone) {
  // 使用固定格式输出，避免不同运行环境 locale 差异导致消息时间样式漂移。
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

  // NEW 是逻辑标记，不参与数值正负格式化。
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
  // 通用 title case 会把 EdgeX、MegaETH、FDV 这类词打坏，这里单独保留项目内常见写法。
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
  // Telegram HTML 模式下必须转义特殊字符，否则标题和链接容易被错误解析。
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

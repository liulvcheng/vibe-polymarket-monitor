import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildDiff } from "./buildDiff.js";
import { buildSnapshot } from "./buildSnapshot.js";
import { loadConfig } from "./config.js";
import { fetchPolymarketAccountData } from "./fetchPm.js";
import { formatMonitorMessages } from "./formatMessage.js";
import { sendTelegramMessages } from "./sendTelegram.js";

// 执行一次完整监控流程：
// 读取状态 -> 拉取 Polymarket -> 构建快照 -> 计算 diff -> 发送 Telegram -> 持久化最新状态。
export async function runMonitor({ config, fetchImpl = fetch }) {
  const currentState = await loadState(config.stateFilePath);
  const accountData = await fetchPolymarketAccountData({
    address: config.pmAddress,
    fetchImpl,
  });
  const snapshot = buildSnapshot(accountData);
  const diff = buildDiff({
    current: snapshot,
    prev1: currentState.snapshots[0] ?? null,
  });
  const messages = formatMonitorMessages({
    snapshot,
    diff,
    timezone: config.timezone,
  });

  await sendTelegramMessages({
    token: config.telegramBotToken,
    chatId: config.telegramChatId,
    messages,
    fetchImpl,
  });

  const nextState = {
    address: config.pmAddress,
    snapshots: [snapshot],
  };

  // 只有 sendTelegramMessages 成功返回，状态才会写盘。
  // 这样下一次 diff 的基线永远对应“已经成功发出去”的那次快照。
  await saveState(config.stateFilePath, nextState);

  return {
    snapshot,
    diff,
    messages,
    state: nextState,
  };
}

export async function main() {
  const config = loadConfig();
  const result = await runMonitor({ config });
  // 输出一段简短 JSON 给 Actions 日志看，排查线上问题时比纯文本更容易 grep。
  process.stdout.write(
    JSON.stringify(
      {
        sentAt: result.snapshot.sentAt,
        positions: result.snapshot.positions.length,
        messages: result.messages.length,
        totalValue: result.snapshot.totalValue,
      },
      null,
      2,
    ) + "\n",
  );
}

async function loadState(stateFilePath) {
  try {
    const content = await readFile(stateFilePath, "utf8");
    const parsed = JSON.parse(content);
    return {
      address: parsed.address ?? "",
      // 即使文件结构异常，也尽量把 snapshots 收敛成数组，避免主流程再做空值判断。
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
    };
  } catch (error) {
    // 首次运行还没有状态文件时，按空状态启动即可。
    if (error.code === "ENOENT") {
      return {
        address: "",
        snapshots: [],
      };
    }

    throw error;
  }
}

async function saveState(stateFilePath, state) {
  // 本地和 Actions 都可能在空目录下启动，写文件前先确保目录存在。
  await mkdir(path.dirname(stateFilePath), { recursive: true });
  await writeFile(stateFilePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

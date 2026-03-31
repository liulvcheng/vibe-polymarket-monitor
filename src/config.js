// 读取并校验运行监控所需的环境变量。
// 这里集中做默认值和格式检查，后续模块可以直接依赖规范化后的配置。
export function loadConfig(env = process.env) {
  // 地址统一转成小写，避免后续拼 URL、比对状态或写日志时因为大小写不同产生噪音。
  const pmAddress = requireString(env.PM_ADDRESS, "PM_ADDRESS").toLowerCase();
  const telegramBotToken = requireString(
    env.TELEGRAM_BOT_TOKEN,
    "TELEGRAM_BOT_TOKEN",
  );
  const telegramChatId = requireString(
    env.TELEGRAM_CHAT_ID,
    "TELEGRAM_CHAT_ID",
  );
  const timezone = env.TZ?.trim() || "Asia/Shanghai";
  const stateFilePath = env.STATE_FILE_PATH?.trim() || "state/state.json";

  // 这里只接受标准 EVM 地址格式，尽量把配置错误挡在程序启动前。
  if (!/^0x[a-f0-9]{40}$/.test(pmAddress)) {
    throw new Error("PM_ADDRESS must be a 42-character hex address");
  }

  return {
    pmAddress,
    telegramBotToken,
    telegramChatId,
    timezone,
    stateFilePath,
  };
}

function requireString(value, key) {
  const normalized = value?.trim();
  // 空字符串和只含空白都视为缺失，避免后续请求才在更深层报错。
  if (!normalized) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return normalized;
}

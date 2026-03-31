// Load and validate the runtime settings required by the monitor.
export function loadConfig(env = process.env) {
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
  if (!normalized) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return normalized;
}

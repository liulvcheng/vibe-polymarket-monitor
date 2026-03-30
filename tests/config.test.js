import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.js";

test("loadConfig returns normalized required settings", () => {
  const config = loadConfig({
    PM_ADDRESS: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_CHAT_ID: "123456",
  });

  assert.deepEqual(config, {
    pmAddress: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
    telegramBotToken: "bot-token",
    telegramChatId: "123456",
    timezone: "Asia/Shanghai",
    stateFilePath: "state/state.json",
  });
});

test("loadConfig accepts overrides for timezone and state path", () => {
  const config = loadConfig({
    PM_ADDRESS: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_CHAT_ID: "123456",
    TZ: "UTC",
    STATE_FILE_PATH: "/tmp/state.json",
  });

  assert.equal(config.timezone, "UTC");
  assert.equal(config.stateFilePath, "/tmp/state.json");
});

test("loadConfig throws when a required key is missing", () => {
  assert.throws(
    () =>
      loadConfig({
        PM_ADDRESS: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
        TELEGRAM_CHAT_ID: "123456",
      }),
    /Missing required environment variable: TELEGRAM_BOT_TOKEN/,
  );
});

test("loadConfig rejects invalid polymarket addresses", () => {
  assert.throws(
    () =>
      loadConfig({
        PM_ADDRESS: "not-an-address",
        TELEGRAM_BOT_TOKEN: "bot-token",
        TELEGRAM_CHAT_ID: "123456",
      }),
    /PM_ADDRESS must be a 42-character hex address/,
  );
});

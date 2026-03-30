import test from "node:test";
import assert from "node:assert/strict";

import { sendTelegramMessages } from "../src/send-telegram.js";

test("sendTelegramMessages posts a single text message when content fits", async () => {
  const sentRequests = [];

  const fetchImpl = async (url, options) => {
    sentRequests.push({ url, options });
    return Response.json({ ok: true, result: { message_id: 1 } });
  };

  await sendTelegramMessages({
    token: "token",
    chatId: "chat",
    messages: ["one"],
    fetchImpl,
  });

  assert.equal(sentRequests.length, 1);
  assert.match(sentRequests[0].url, /sendMessage$/);
  assert.equal(JSON.parse(sentRequests[0].options.body).text, "one");
});

test("sendTelegramMessages falls back to a single document for multi-part content", async () => {
  const sentRequests = [];

  const fetchImpl = async (url, options) => {
    sentRequests.push({ url, options });
    return Response.json({ ok: true, result: { message_id: 1 } });
  };

  await sendTelegramMessages({
    token: "token",
    chatId: "chat",
    messages: ["part 1\nsummary", "part 2"],
    fetchImpl,
  });

  assert.equal(sentRequests.length, 1);
  assert.match(sentRequests[0].url, /sendDocument$/);
  assert.ok(sentRequests[0].options.body instanceof FormData);
});

test("sendTelegramMessages throws on Telegram API failures", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ ok: false, description: "chat not found" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });

  await assert.rejects(
    () =>
      sendTelegramMessages({
        token: "token",
        chatId: "chat",
        messages: ["one"],
        fetchImpl,
      }),
    /Telegram send failed with HTTP 400: chat not found/,
  );
});

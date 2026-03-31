import test from "node:test";
import assert from "node:assert/strict";

import { sendTelegramMessages } from "../src/sendTelegram.js";

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
  assert.equal(JSON.parse(sentRequests[0].options.body).parse_mode, "HTML");
  assert.equal(JSON.parse(sentRequests[0].options.body).disable_web_page_preview, true);
});

test("sendTelegramMessages sends multi-part content as ordered messages", async () => {
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

  assert.equal(sentRequests.length, 2);
  assert.match(sentRequests[0].url, /sendMessage$/);
  assert.match(sentRequests[1].url, /sendMessage$/);
  assert.equal(JSON.parse(sentRequests[0].options.body).text, "part 1\nsummary");
  assert.equal(JSON.parse(sentRequests[1].options.body).text, "part 2");
  assert.equal(JSON.parse(sentRequests[0].options.body).parse_mode, "HTML");
  assert.equal(JSON.parse(sentRequests[1].options.body).parse_mode, "HTML");
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

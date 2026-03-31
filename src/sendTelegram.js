// 按顺序逐条发送消息分片，保证 Telegram 中的阅读顺序稳定。
export async function sendTelegramMessages({
  token,
  chatId,
  messages,
  fetchImpl = fetch,
}) {
  // 顺序发送而不是并发发送，避免 Telegram 客户端里多段消息乱序。
  for (const message of messages) {
    await sendRequest({
      token,
      endpoint: "sendMessage",
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      headers: {
        "content-type": "application/json",
      },
      fetchImpl,
    });
  }
}

async function sendRequest({ token, endpoint, body, headers, fetchImpl }) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/${endpoint}`, {
    method: "POST",
    headers,
    body,
  });

  const payload = await response.json();
  // Telegram 可能返回 HTTP 200 但 payload.ok=false，这里两层都要检查。
  if (!response.ok || payload.ok === false) {
    const description = payload?.description ?? "unknown Telegram API error";
    throw new Error(`Telegram send failed with HTTP ${response.status}: ${description}`);
  }
}

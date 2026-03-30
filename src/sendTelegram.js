export async function sendTelegramMessages({
  token,
  chatId,
  messages,
  fetchImpl = fetch,
}) {
  for (const message of messages) {
    await sendRequest({
      token,
      endpoint: "sendMessage",
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
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
  if (!response.ok || payload.ok === false) {
    const description = payload?.description ?? "unknown Telegram API error";
    throw new Error(`Telegram send failed with HTTP ${response.status}: ${description}`);
  }
}

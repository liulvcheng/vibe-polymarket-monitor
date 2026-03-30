export async function sendTelegramMessages({
  token,
  chatId,
  messages,
  fetchImpl = fetch,
}) {
  if (messages.length === 1) {
    await sendRequest({
      token,
      endpoint: "sendMessage",
      body: JSON.stringify({
        chat_id: chatId,
        text: messages[0],
      }),
      headers: {
        "content-type": "application/json",
      },
      fetchImpl,
    });
    return;
  }

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("caption", buildDocumentCaption(messages[0]));
  formData.append(
    "document",
    new Blob([messages.join("\n\n---\n\n")], { type: "text/plain" }),
    "polymarket-monitor.txt",
  );

  await sendRequest({
    token,
    endpoint: "sendDocument",
    body: formData,
    headers: undefined,
    fetchImpl,
  });
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

function buildDocumentCaption(firstMessage) {
  const lines = firstMessage.split("\n");
  const summaryLines = [];

  for (const line of lines) {
    if (!line.trim()) {
      break;
    }

    summaryLines.push(line);
  }

  const caption = `${summaryLines.join("\n")}\n\nFull details are attached as a text file.`;
  return caption.slice(0, 1024);
}

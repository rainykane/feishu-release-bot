import { config } from "./config";
import type { TenantTokenResponse } from "./types";

let cachedToken = "";
let tokenExpiresAt = 0;

async function getTenantToken(): Promise<string> {
  if (cachedToken && Date.now() + 120_000 < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch(
    `${config.feishu.apiHost}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: config.feishu.appId,
        app_secret: config.feishu.appSecret,
      }),
    }
  );

  const data: TenantTokenResponse = await res.json();
  if (data.code !== 0) {
    throw new Error(`get tenant token: code ${data.code}: ${data.msg}`);
  }

  cachedToken = data.tenant_access_token;
  tokenExpiresAt = Date.now() + data.expire * 1000;
  return cachedToken;
}

export async function sendCard(chatId: string, cardJSON: string): Promise<void> {
  const token = await getTenantToken();
  const body = JSON.stringify({
    receive_id: chatId,
    msg_type: "interactive",
    content: cardJSON,
  });

  const res = await fetch(
    `${config.feishu.apiHost}/open-apis/im/v1/messages?receive_id_type=chat_id`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`send card: code ${data.code}: ${data.msg}`);
  }
}

export async function updateCard(
  messageId: string,
  cardJSON: string
): Promise<void> {
  const token = await getTenantToken();
  const res = await fetch(
    `${config.feishu.apiHost}/open-apis/im/v1/messages/${messageId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: cardJSON }),
    }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`update card: code ${data.code}: ${data.msg}`);
  }
}

// Delayed card update using the token from card callback.
// Must be called AFTER responding to the callback (within 30 min, max 2 uses per token).
export async function updateCardByToken(
  callbackToken: string,
  cardJSON: string
): Promise<void> {
  const tenantToken = await getTenantToken();
  const card = JSON.parse(cardJSON);
  const res = await fetch(
    `${config.feishu.apiHost}/open-apis/interactive/v1/card/update`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tenantToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ token: callbackToken, card }),
    }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`delayed card update: code ${data.code}: ${data.msg}`);
  }
}

export async function sendText(
  chatId: string,
  text: string
): Promise<void> {
  const token = await getTenantToken();
  const content = JSON.stringify({ text });
  const body = JSON.stringify({
    receive_id: chatId,
    msg_type: "text",
    content,
  });

  try {
    await fetch(
      `${config.feishu.apiHost}/open-apis/im/v1/messages?receive_id_type=chat_id`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
      }
    );
  } catch {
    // Text message delivery failures are non-critical
  }
}

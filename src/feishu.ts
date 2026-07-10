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

// Rich text message via post format. Supports **bold** and <at user_id="xxx"></at>.
export async function sendRichText(
  chatId: string,
  text: string
): Promise<void> {
  const token = await getTenantToken();

  // Parse text into post content structure
  const lines = text.split("\n");
  const paragraphs: any[][] = [];

  for (const line of lines) {
    const segments: any[] = [];
    // Split by **bold** markers
    const parts = line.split(/(\*\*.*?\*\*|<at user_id="[^"]+"><\/at>)/);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("**") && part.endsWith("**")) {
        segments.push({
          tag: "text",
          text: part.slice(2, -2),
          style: ["bold"],
        });
      } else if (part.startsWith('<at user_id="')) {
        const userId = part.match(/user_id="([^"]+)"/)?.[1] ?? "";
        segments.push({ tag: "at", user_id: userId });
      } else {
        segments.push({ tag: "text", text: part });
      }
    }
    if (segments.length > 0) {
      paragraphs.push(segments);
    }
  }

  const content = JSON.stringify({ zh_cn: { content: paragraphs } });
  const body = JSON.stringify({
    receive_id: chatId,
    msg_type: "post",
    content,
  });

  try {
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
      console.error(`send rich text: code ${data.code}: ${data.msg}`);
    }
  } catch (err: any) {
    console.error(`send rich text failed: ${err.message}`);
  }
}

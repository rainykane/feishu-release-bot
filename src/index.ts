import express from "express";
import { config } from "./config";
import { listBranches, triggerWorkflow } from "./github";
import { sendCard, sendText } from "./feishu";
import { buildReleaseCard } from "./card";
import { setBranch, getBranch, remove } from "./state";
import type {
  FeishuEventWrapper,
  UrlVerification,
  MessageEvent,
  TextContent,
  CardActionCallback,
} from "./types";

const app = express();

// Parse body first so it's available in the logger
app.use(express.json());

// ── Logging ─────────────────────────────────────────────────────────

app.use((req, _res, next) => {
  const start = Date.now();

  // Log request
  console.log(
    `[${new Date().toISOString()}] --> ${req.method} ${req.path} | body: ${JSON.stringify(req.body).slice(0, 500)}`
  );

  // Intercept res.send (res.json and res.sendStatus both call it internally)
  const origSend = _res.send.bind(_res);
  _res.send = function (body: unknown) {
    const ms = Date.now() - start;
    const preview =
      typeof body === "string"
        ? body.slice(0, 200)
        : JSON.stringify(body).slice(0, 200);
    console.log(
      `[${new Date().toISOString()}] <-- ${req.method} ${req.path} ${_res.statusCode} ${ms}ms | ${preview}`
    );
    return origSend(body);
  };

  next();
});

// ── Unified Callback Endpoint ───────────────────────────────────────

app.post("/callback", async (req, res) => {
  const body = req.body;

  // 1. URL verification (first-time event subscription setup)
  if ((body as UrlVerification).type === "url_verification") {
    const challenge = (body as UrlVerification).challenge;
    console.log(`[callback] URL verification challenge: ${challenge}`);
    res.json({ challenge });
    return;
  }

  // 2. Parse event wrapper
  const wrapper = body as FeishuEventWrapper;
  const eventType = wrapper.header?.event_type;

  if (!eventType) {
    console.log("[callback] Unknown request, no event_type");
    res.sendStatus(200);
    return;
  }

  console.log(`[callback] event_type: ${eventType}`);

  switch (eventType) {
    // ── Message event: bot @mentioned in group ───────────────────
    case "im.message.receive_v1":
      handleMessageEvent(wrapper, res);
      break;

    // ── Card action: user clicked button or selected dropdown ────
    case "card.action.trigger":
      await handleCardAction(wrapper, res);
      break;

    default:
      console.log(`[callback] Unhandled event_type: ${eventType}`);
      res.sendStatus(200);
  }
});

// ── Health check ───────────────────────────────────────────────────

app.get("/health", (_req, res) => res.send("ok"));

// ── Message Event Handler ──────────────────────────────────────────

function handleMessageEvent(
  wrapper: FeishuEventWrapper,
  res: express.Response
) {
  const msg = wrapper.event as MessageEvent;
  if (!msg?.message) {
    res.sendStatus(200);
    return;
  }

  console.log(
    `[message] chat_type=${msg.message.chat_type} content=${msg.message.content.slice(0, 100)}`
  );

  // Only group chat
  if (msg.message.chat_type !== "group") {
    console.log("[message] Skipped: not a group chat");
    res.sendStatus(200);
    return;
  }

  // Check bot @mention
  const mentions = msg.message.mentions || [];
  const botMentioned = mentions.some((m) => !!m.id?.open_id);
  if (!botMentioned) {
    console.log("[message] Skipped: bot not mentioned");
    res.sendStatus(200);
    return;
  }

  // Parse text
  let tc: TextContent;
  try {
    tc = JSON.parse(msg.message.content);
  } catch {
    console.log("[message] Skipped: failed to parse text content");
    res.sendStatus(200);
    return;
  }

  let text = (tc.text || "").trim();
  if (!text) {
    res.sendStatus(200);
    return;
  }

  // Remove @mention prefix: "@bot release" → "release"
  const spaceIdx = text.indexOf(" ");
  if (spaceIdx > 0) {
    text = text.slice(spaceIdx + 1).trim();
  }

  console.log(`[message] Command text: "${text}"`);

  const triggers = ["release", "/release", "打包", "/打包"];
  if (!triggers.includes(text.toLowerCase())) {
    console.log(`[message] Skipped: not a trigger word`);
    res.sendStatus(200);
    return;
  }

  // Respond immediately, process async
  res.sendStatus(200);

  const chatId = msg.message.chat_id;
  handleReleaseCommand(chatId);
}

async function handleReleaseCommand(chatId: string) {
  console.log(`[release] Fetching branches...`);
  try {
    const branches = await listBranches();
    console.log(`[release] Got ${branches.length} branches: ${branches.join(", ")}`);

    const cardJSON = buildReleaseCard(branches);
    await sendCard(chatId, cardJSON);
    console.log(`[release] Card sent to chat ${chatId}`);
  } catch (err: any) {
    console.error(`[release] Failed: ${err.message}`);
    sendText(
      chatId,
      "❌ Failed to fetch branches. Please check the bot configuration."
    );
  }
}

// ── Card Action Handler ────────────────────────────────────────────

async function handleCardAction(
  wrapper: FeishuEventWrapper,
  res: express.Response
) {
  const cb = wrapper.event as CardActionCallback;

  const key = cb?.action?.value?.key;
  console.log(
    `[card] action=${cb?.action?.tag} key=${key} open_message_id=${cb?.open_message_id} user=${cb?.open_id}`
  );

  if (!key) {
    console.log("[card] Skipped: no action key");
    res.sendStatus(200);
    return;
  }

  switch (key) {
    case "branch_select": {
      const branch = parseOption(cb.action.option);
      if (branch) {
        setBranch(cb.open_message_id, branch);
        console.log(
          `[card] Branch selected: "${branch}" → card ${cb.open_message_id}`
        );
      }
      res.sendStatus(200);
      break;
    }

    case "only_build":
      await handleBuildTrigger(res, cb, true);
      break;

    case "build_release":
      await handleBuildTrigger(res, cb, false);
      break;

    default:
      console.log(`[card] Unhandled key: ${key}`);
      res.sendStatus(200);
  }
}

async function handleBuildTrigger(
  res: express.Response,
  cb: CardActionCallback,
  buildOnly: boolean
) {
  const branch = getBranch(cb.open_message_id);
  if (!branch) {
    console.log(`[card] Build trigger failed: no branch selected`);
    res.json({
      toast: {
        type: "error",
        content: "Please select a branch first, then click the button again.",
      },
    });
    return;
  }

  const modeStr = buildOnly ? "Only Build (image only)" : "Build & Release";

  try {
    console.log(
      `[workflow] Dispatching: branch=${branch} mode=${modeStr}`
    );
    await triggerWorkflow(branch, buildOnly);
    remove(cb.open_message_id);

    res.json({
      toast: {
        type: "success",
        content: `✅ Workflow triggered! Branch: ${branch}, Mode: ${modeStr}`,
      },
    });

    const msg = [
      "🚀 Release workflow triggered!",
      `Branch: \`${branch}\``,
      `Mode: ${modeStr}`,
      `Check GitHub Actions: https://github.com/${config.github.owner}/${config.github.repo}/actions`,
    ].join("\n");
    sendText(cb.open_chat_id, msg);

    console.log(
      `[workflow] ✅ Dispatched: branch=${branch} mode=${modeStr} user=${cb.open_id}`
    );
  } catch (err: any) {
    console.error(`[workflow] ❌ Failed: ${err.message}`);
    res.json({
      toast: {
        type: "error",
        content: `❌ Failed to trigger workflow: ${err.message}`,
      },
    });
  }
}

// ── Helper ─────────────────────────────────────────────────────────

function parseOption(option?: string): string | null {
  if (!option) return null;
  if (option.startsWith('"')) {
    try {
      return JSON.parse(option) as string;
    } catch {
      // fall through
    }
  }
  return option;
}

// ── Start ──────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log("═══════════════════════════════════════════");
  console.log("  Feishu Release Bot");
  console.log("═══════════════════════════════════════════");
  console.log(`  Port:     ${config.port}`);
  console.log(`  Callback: POST /callback`);
  console.log(`  Health:   GET  /health`);
  console.log("═══════════════════════════════════════════");
});

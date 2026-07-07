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

// Parse raw body for both JSON and text
app.use(
  express.json({
    verify: (_req, _res, buf) => {
      (_req as any).rawBody = buf.toString();
    },
  })
);

// ── Event Subscription ─────────────────────────────────────────────

app.post("/feishu/event", async (req, res) => {
  const body = req.body;

  // 1. URL verification challenge
  if ((body as UrlVerification).type === "url_verification") {
    res.json({ challenge: (body as UrlVerification).challenge });
    return;
  }

  // 2. Parse event
  const wrapper = body as FeishuEventWrapper;
  if (wrapper.header?.event_type !== "im.message.receive_v1") {
    res.sendStatus(200);
    return;
  }

  const msg = wrapper.event as MessageEvent;
  if (!msg.message) {
    res.sendStatus(200);
    return;
  }

  // 3. Only group chat with bot @mention
  if (msg.message.chat_type !== "group") {
    res.sendStatus(200);
    return;
  }

  const mentions = msg.message.mentions || [];
  let botMentioned = false;
  for (const m of mentions) {
    if (m.id?.open_id) {
      // The bot's open_id will be present when @mentioned
      botMentioned = true;
      break;
    }
  }
  if (!botMentioned) {
    res.sendStatus(200);
    return;
  }

  // 4. Parse message text
  let tc: TextContent;
  try {
    tc = JSON.parse(msg.message.content);
  } catch {
    res.sendStatus(200);
    return;
  }

  let text = (tc.text || "").trim();
  if (!text) {
    res.sendStatus(200);
    return;
  }

  // Remove @mention prefix if present
  const spaceIdx = text.indexOf(" ");
  if (spaceIdx > 0) {
    text = text.slice(spaceIdx + 1).trim();
  }

  const triggers = ["release", "/release", "打包", "/打包"];
  if (!triggers.includes(text.toLowerCase())) {
    res.sendStatus(200);
    return;
  }

  // 5. Respond immediately, process async
  res.sendStatus(200);

  try {
    const branches = await listBranches();
    const cardJSON = buildReleaseCard(branches);
    await sendCard(msg.message.chat_id, cardJSON);
  } catch (err) {
    console.error("handleReleaseCommand:", err);
    sendText(
      msg.message.chat_id,
      "❌ Failed to fetch branches. Please check the bot configuration."
    );
  }
});

// ── Card Action Callback ───────────────────────────────────────────

app.post("/feishu/card", async (req, res) => {
  const cb = req.body as CardActionCallback;

  if (!cb.action?.value?.key) {
    res.sendStatus(200);
    return;
  }

  const { key } = cb.action.value;

  switch (key) {
    case "branch_select": {
      const branch = parseOption(cb.action.option);
      if (branch) {
        setBranch(cb.open_message_id, branch);
        console.log(`Branch selected: ${branch} for card ${cb.open_message_id}`);
      }
      res.sendStatus(200);
      break;
    }

    case "only_build": {
      await handleBuildTrigger(res, cb, true);
      break;
    }

    case "build_release": {
      await handleBuildTrigger(res, cb, false);
      break;
    }

    default:
      res.sendStatus(200);
  }
});

async function handleBuildTrigger(
  res: express.Response,
  cb: CardActionCallback,
  buildOnly: boolean
) {
  const branch = getBranch(cb.open_message_id);
  if (!branch) {
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
    await triggerWorkflow(branch, buildOnly);
    remove(cb.open_message_id);

    res.json({
      toast: {
        type: "success",
        content: `✅ Workflow triggered! Branch: ${branch}, Mode: ${modeStr}`,
      },
    });

    // Follow-up text message
    const msg = [
      "🚀 Release workflow triggered!",
      `Branch: \`${branch}\``,
      `Mode: ${modeStr}`,
      `Check GitHub Actions: https://github.com/${config.github.owner}/${config.github.repo}/actions`,
    ].join("\n");
    sendText(cb.open_chat_id, msg);

    console.log(
      `Workflow triggered: branch=${branch}, mode=${modeStr}, user=${cb.open_id}`
    );
  } catch (err: any) {
    console.error("handleBuildTrigger:", err);
    res.json({
      toast: {
        type: "error",
        content: `❌ Failed to trigger workflow: ${err.message}`,
      },
    });
  }
}

// ── Health check ───────────────────────────────────────────────────

app.get("/health", (_req, res) => res.send("ok"));

// ── Start ──────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(`Feishu Release Bot running on port ${config.port}`);
  console.log(`  Event endpoint:  POST /feishu/event`);
  console.log(`  Card endpoint:   POST /feishu/card`);
  console.log(`  Health:           GET /health`);
});

// ── Helpers ────────────────────────────────────────────────────────

function parseOption(option?: string): string | null {
  if (!option) return null;
  // Feishu may send option as a plain string or JSON-encoded string
  if (option.startsWith('"')) {
    try {
      return JSON.parse(option) as string;
    } catch {
      // fall through
    }
  }
  return option;
}

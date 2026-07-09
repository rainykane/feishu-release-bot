import express from "express";
import crypto from "crypto";
import { config } from "./config";
import { listBranches, triggerWorkflow, getLatestRun } from "./github";
import { sendCard, sendText, updateCardByToken } from "./feishu";
import { buildReleaseCard } from "./card";
import {
  setProject,
  getProject,
  setBranch,
  getBranch,
  remove,
  setRunContext,
  getRunContext,
  removeRunContext,
} from "./state";
import type {
  FeishuEventWrapper,
  UrlVerification,
  MessageEvent,
  TextContent,
  CardActionCallback,
  ProjectConfig,
} from "./types";

const app = express();

// Branch cache: projectName → branch[] (prefetched when card is first sent)
const branchCache = new Map<string, string[]>();

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

// ── Event Subscription ───────────────────────────────────────────────
// 飞书后台「事件与回调」→「事件配置」→ 请求网址 URL

app.post("/event", async (req, res) => {
  const body = req.body;

  // 1. URL verification (飞书首次配置时发 challenge 验证)
  if ((body as UrlVerification).type === "url_verification") {
    const challenge = (body as UrlVerification).challenge;
    console.log(`[event] URL verification challenge: ${challenge}`);
    res.json({ challenge });
    return;
  }

  // 2. Parse event wrapper
  const wrapper = body as FeishuEventWrapper;
  const eventType = wrapper.header?.event_type;

  if (!eventType) {
    console.log("[event] Unknown request, no event_type");
    res.sendStatus(200);
    return;
  }

  console.log(`[event] event_type: ${eventType}`);

  switch (eventType) {
    case "im.message.receive_v1":
      handleMessageEvent(wrapper, res);
      break;
    default:
      console.log(`[event] Unhandled event_type: ${eventType}`);
      res.json({});
  }
});

// ── Card Action Callback ────────────────────────────────────────────
// 飞书后台「事件与回调」→「回调配置」→「消息卡片请求网址」

app.post("/callback", async (req, res) => {
  const body = req.body;

  // 飞书首次配置卡片回调 URL 时也会发 URL 验证
  if ((body as UrlVerification).type === "url_verification") {
    const challenge = (body as UrlVerification).challenge;
    console.log(`[card] URL verification challenge: ${challenge}`);
    res.json({ challenge });
    return;
  }

  // 飞书可能把卡片回调包在事件信封里发过来，先解包
  const cb = unwrapCardAction(body);
  if (!cb) {
    console.log("[card] Skipped: cannot parse card action");
    res.json({});
    return;
  }

  const key = cb?.action?.value?.key;
  console.log(
    `[card] action=${cb?.action?.tag} key=${key} open_message_id=${cb?.open_message_id} user=${cb?.open_id}`
  );

  if (!key) {
    console.log("[card] Skipped: no action key");
    res.json({});
    return;
  }

  switch (key) {
    case "project_select": {
      const projectName = parseOption(cb.action.option);
      if (!projectName) {
        res.json({});
        break;
      }
      const project = findProject(projectName);
      if (!project) {
        console.log(`[card] Unknown project: ${projectName}`);
        res.json({});
        break;
      }
      setProject(cb.open_message_id, projectName);
      console.log(
        `[card] Project selected: "${projectName}" → card ${cb.open_message_id}`
      );

      // Respond empty immediately to avoid 200672 timeout,
      // then async update card via delayed update API (uses callback token)
      res.json({});

      const cached = branchCache.get(projectName);
      if (cached) {
        updateCardWithBranches(cb.token, project, cached);
      } else {
        fetchBranchesAndUpdateCardByToken(cb.token, project);
      }
      break;
    }

    case "branch_select": {
      const branch = parseOption(cb.action.option);
      if (branch) {
        setBranch(cb.open_message_id, branch);
        console.log(
          `[card] Branch selected: "${branch}" → card ${cb.open_message_id}`
        );
      }
      res.json({});
      break;
    }

    case "only_build":
      await handleBuildTrigger(res, cb, true);
      break;

    case "build_release":
      await handleBuildTrigger(res, cb, false);
      break;

    case "refresh_branches":
      await handleRefreshBranches(res, cb);
      break;

    default:
      console.log(`[card] Unhandled key: ${key}`);
      res.json({});
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

  // Only group chat or private (p2p)
  if (msg.message.chat_type !== "group" && msg.message.chat_type !== "p2p") {
    console.log(`[message] Skipped: unsupported chat_type ${msg.message.chat_type}`);
    res.sendStatus(200);
    return;
  }

  const isGroup = msg.message.chat_type === "group";

  // Group chat: check bot @mention
  if (isGroup) {
    const mentions = msg.message.mentions || [];
    const botMentioned = mentions.some((m) => !!m.id?.open_id);
    if (!botMentioned) {
      console.log("[message] Skipped: bot not mentioned");
      res.sendStatus(200);
      return;
    }
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

  // Group chat: remove @mention prefix: "@bot release" → "release"
  if (isGroup) {
    const spaceIdx = text.indexOf(" ");
    if (spaceIdx > 0) {
      text = text.slice(spaceIdx + 1).trim();
    }
  }

  console.log(`[message] Command text: "${text}"`);

  const triggers = ["release", "/release", "打包", "/打包", "build"];
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
  console.log(`[release] Sending card with ${config.github.projects.length} project(s)...`);
  try {
    // Send card with project list, empty branches (user selects project first)
    const cardJSON = buildReleaseCard(config.github.projects, []);
    await sendCard(chatId, cardJSON);
    console.log(`[release] Card sent to chat ${chatId}`);

    // Prefetch branches for all projects in background so cache is warm
    for (const p of config.github.projects) {
      prefetchBranches(p);
    }
  } catch (err: any) {
    console.error(`[release] Failed: ${err.message}`);
    sendText(
      chatId,
      "❌ Failed to send card. Please check the bot configuration."
    );
  }
}

// ── Card Build Trigger ──────────────────────────────────────────────

async function handleBuildTrigger(
  res: express.Response,
  cb: CardActionCallback,
  buildOnly: boolean
) {
  const projectName = getProject(cb.open_message_id);
  const branch = getBranch(cb.open_message_id);

  if (!projectName || !branch) {
    console.log(`[card] Build trigger failed: no project or branch selected`);
    res.json({
      toast: {
        type: "error",
        content: "Please select a project and branch first, then click the button again.",
      },
    });
    return;
  }

  const project = findProject(projectName);
  if (!project) {
    res.json({
      toast: {
        type: "error",
        content: `Unknown project: ${projectName}`,
      },
    });
    return;
  }

  const modeStr = buildOnly ? "构建" : "构建与发布";

  try {
    console.log(
      `[workflow] Dispatching: project=${projectName} branch=${branch} mode=${modeStr}`
    );
    await triggerWorkflow(project, branch, buildOnly);
    remove(cb.open_message_id);

    res.json({
      toast: {
        type: "success",
        content: `✅ 已触发构建！${projectName} @ ${branch}`,
      },
    });

    console.log(
      `[workflow] ✅ Dispatched: project=${projectName} branch=${branch} mode=${modeStr} user=${cb.open_id}`
    );

    // One-shot lookup to find the run_id, then store for webhook
    setTimeout(async () => {
      try {
        await new Promise((r) => setTimeout(r, 6_000));
        const run = await getLatestRun(project, branch);
        if (run) {
          setRunContext(run.id, cb.open_chat_id, cb.open_id, branch, projectName, modeStr);
          console.log(`[workflow] Stored run #${run.id} → chat ${cb.open_chat_id}`);
          sendText(
            cb.open_chat_id,
            `开始构建 ⏳\n**项目:** ${projectName}\n**分支:** ${branch}\n${run.html_url}`
          );
        }
      } catch (err: any) {
        console.error(`[workflow] Failed to find run: ${err.message}`);
      }
    }, 0);
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

async function handleRefreshBranches(
  res: express.Response,
  cb: CardActionCallback
) {
  const projectName = getProject(cb.open_message_id);
  if (!projectName) {
    res.json({
      toast: {
        type: "error",
        content: "Please select a project first.",
      },
    });
    return;
  }

  const project = findProject(projectName);
  if (!project) {
    res.json({
      toast: {
        type: "error",
        content: `Unknown project: ${projectName}`,
      },
    });
    return;
  }

  console.log(`[card] Refresh branches for ${projectName}`);
  // Respond immediately, then async update card via delayed update API
  res.json({
    toast: { type: "info", content: "Refreshing branches..." },
  });
  fetchBranchesAndUpdateCardByToken(cb.token, project);
}

// ── GitHub Webhook ──────────────────────────────────────────────────
// Repo Settings → Webhooks → Payload URL = https://<host>/webhook
// Content type: application/json, Secret: same as GITHUB_WEBHOOK_SECRET
// Events: "Workflow runs" (just workflow_run)
//
// GitHub doesn't include workflow inputs in the payload, so we rely on
// the run_id → chat_id mapping stored at dispatch time.

app.post("/webhook", (req, res) => {
  // Verify signature
  const sig = req.headers["x-hub-signature-256"] as string | undefined;
  if (!sig) {
    console.log("[webhook] Missing signature header");
    res.status(401).send("Missing signature");
    return;
  }

  const rawBody = JSON.stringify(req.body);
  const hmac = crypto.createHmac("sha256", config.github.webhookSecret);
  const expected = `sha256=${hmac.update(rawBody).digest("hex")}`;

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    console.log("[webhook] Signature mismatch");
    res.status(401).send("Bad signature");
    return;
  }

  const eventType = req.headers["x-github-event"] as string;
  console.log(
    `[webhook] event=${eventType} action=${req.body?.action} run_id=${req.body?.workflow_run?.id}`
  );

  // Only care about workflow_run completed
  if (eventType !== "workflow_run" || req.body?.action !== "completed") {
    res.send("ok");
    return;
  }

  const run = req.body.workflow_run;
  if (!run?.id) {
    res.send("ok");
    return;
  }

  const ctx = getRunContext(run.id);
  if (!ctx) {
    console.log(`[webhook] Run #${run.id} has no chat context, skipping`);
    res.send("ok");
    return;
  }
  removeRunContext(run.id);

  const conclusion = run.conclusion ?? "unknown";
  const resultText =
    conclusion === "success"
      ? `构建成功 ヾ(^▽^)ノ <at user_id="${ctx.openId}"></at>`
      : conclusion === "failure"
        ? `构建失败 ❌ <at user_id="${ctx.openId}"></at>`
        : `构建${conclusion} ⚠️ <at user_id="${ctx.openId}"></at>`;

  const msg = [
    resultText,
    `**项目:** ${ctx.projectName}`,
    `**分支:** ${ctx.branch}`,
    run.html_url,
  ].join("\n");

  sendText(ctx.chatId, msg);
  console.log(
    `[webhook] Notified chat ${ctx.chatId}: run #${run.id} ${conclusion}`
  );

  res.send("ok");
});

// ── Async Card Updater ──────────────────────────────────────────────
// Called after responding to the callback, so it won't hit Feishu's 3s timeout.

async function prefetchBranches(project: ProjectConfig) {
  // Skip if already cached
  if (branchCache.has(project.name)) return;
  try {
    const branches = await listBranches(project);
    branchCache.set(project.name, branches);
    console.log(`[prefetch] Cached ${branches.length} branches for ${project.name}`);
  } catch (err: any) {
    console.error(`[prefetch] Failed for ${project.name}: ${err.message}`);
  }
}

async function fetchBranchesAndUpdateCardByToken(
  callbackToken: string,
  project: ProjectConfig
) {
  try {
    const branches = await listBranches(project);
    branchCache.set(project.name, branches);
    console.log(`[card] Got ${branches.length} branches for ${project.name}`);
    await updateCardWithBranches(callbackToken, project, branches);
  } catch (err: any) {
    console.error(`[card] Failed to fetch branches: ${err.message}`);
  }
}

async function updateCardWithBranches(
  callbackToken: string,
  project: ProjectConfig,
  branches: string[]
) {
  try {
    const cardStr = buildReleaseCard(
      config.github.projects,
      branches,
      project
    );
    await updateCardByToken(callbackToken, cardStr);
    console.log(
      `[card] Card updated via token with ${branches.length} branches for ${project.name}`
    );
  } catch (err: any) {
    console.error(`[card] Failed to update card via token: ${err.message}`);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function findProject(name: string): ProjectConfig | undefined {
  return config.github.projects.find((p) => p.name === name);
}

// 飞书可能把卡片回调包在事件信封里，也可能直接发裸的
// 两种格式都兼容：
//   裸:  {"open_id":"...", "open_message_id":"...", "open_chat_id":"...", "action":{...}}
//   包:  {"schema":"2.0", "header":{"event_type":"card.action.trigger"}, "event":{"operator":{"open_id":"..."}, "open_message_id":"...", "open_chat_id":"...", "action":{...}}}
function unwrapCardAction(body: any): CardActionCallback | null {
  if (!body) return null;

  // 信封格式 → 归一化字段
  const wrapper = body as FeishuEventWrapper;
  if (wrapper.header?.event_type === "card.action.trigger" && wrapper.event) {
    const ev = wrapper.event as any;
    // Debug: log available top-level keys to find correct field names
    console.log("[card] DEBUG event keys:", Object.keys(ev).join(", "));
    console.log(
      "[card] DEBUG ev.open_message_id=%s ev.context?.open_message_id=%s ev.message?.message_id=%s",
      ev.open_message_id,
      ev.context?.open_message_id,
      ev.message?.message_id
    );
    console.log(
      "[card] DEBUG ev.open_chat_id=%s ev.context?.open_chat_id=%s ev.message?.chat_id=%s",
      ev.open_chat_id,
      ev.context?.open_chat_id,
      ev.message?.chat_id
    );
    return {
      open_id: ev.operator?.open_id ?? "",
      open_message_id:
        ev.open_message_id ||
        ev.context?.open_message_id ||
        ev.message?.message_id ||
        "",
      open_chat_id:
        ev.open_chat_id ||
        ev.context?.open_chat_id ||
        ev.message?.chat_id ||
        "",
      token: ev.token ?? "",
      action: ev.action ?? { tag: "", value: { key: "branch_select" } },
    };
  }

  // 裸格式 → 直接使用
  if (body.action?.value?.key) {
    return body as CardActionCallback;
  }

  return null;
}

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
  console.log(`  Projects: ${config.github.projects.map((p) => p.name).join(", ")}`);
  console.log(`  Event:    POST /event`);
  console.log(`  Callback: POST /callback`);
  console.log(`  Webhook:  POST /webhook`);
  console.log(`  Health:   GET  /health`);
  console.log("═══════════════════════════════════════════");
});

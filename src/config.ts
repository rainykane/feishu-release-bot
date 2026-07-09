import dotenv from "dotenv";
dotenv.config();

import type { ProjectConfig } from "./types";
import pkg from "../package.json";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function parseProjects(): ProjectConfig[] {
  const json = process.env.GITHUB_PROJECTS;
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("GITHUB_PROJECTS must be a non-empty JSON array");
      }
      for (const p of parsed) {
        if (!p.name || !p.owner || !p.repo || !p.workflowId) {
          throw new Error(
            `GITHUB_PROJECTS: each project needs name, owner, repo, workflowId`
          );
        }
      }
      return parsed;
    } catch (err: any) {
      if (err.message.includes("GITHUB_PROJECTS")) throw err;
      throw new Error(`GITHUB_PROJECTS: invalid JSON — ${err.message}`);
    }
  }

  // Legacy fallback: single-project from individual env vars
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const workflowId = process.env.GITHUB_WORKFLOW_ID;
  if (owner && repo && workflowId) {
    return [{ name: repo, owner, repo, workflowId }];
  }

  throw new Error(
    "Set GITHUB_PROJECTS (JSON array) or GITHUB_OWNER/GITHUB_REPO/GITHUB_WORKFLOW_ID"
  );
}

export const config = {
  version: pkg.version,
  port: parseInt(process.env.PORT || "3000", 10),

  feishu: {
    appId: requireEnv("FEISHU_APP_ID"),
    appSecret: requireEnv("FEISHU_APP_SECRET"),
    verificationToken: process.env.FEISHU_VERIFICATION_TOKEN || "",
    botName: process.env.FEISHU_BOT_NAME || "Release Bot",
    apiHost: "https://open.feishu.cn",
  },

  github: {
    token: requireEnv("GITHUB_TOKEN"),
    projects: parseProjects(),
    webhookSecret: requireEnv("GITHUB_WEBHOOK_SECRET"),
  },
};

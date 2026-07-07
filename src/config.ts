import dotenv from "dotenv";
dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
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
    owner: requireEnv("GITHUB_OWNER"),
    repo: requireEnv("GITHUB_REPO"),
    workflowId: requireEnv("GITHUB_WORKFLOW_ID"),
  },
};

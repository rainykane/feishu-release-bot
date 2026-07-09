// Feishu event types

export interface FeishuEventWrapper {
  schema: string;
  header: { event_id: string; event_type: string; token?: string };
  event: unknown;
}

export interface UrlVerification {
  challenge: string;
  token: string;
  type: "url_verification";
}

export interface MessageEvent {
  sender: { sender_id: { open_id: string } };
  message: {
    message_id: string;
    chat_id: string;
    chat_type: string;
    message_type: string;
    content: string; // JSON-encoded
    mentions: Array<{ id: { open_id: string }; name: string }>;
  };
}

export interface TextContent {
  text: string;
}

// Card action callback types

export interface CardActionCallback {
  open_id: string;
  open_message_id: string;
  open_chat_id: string;
  token: string; // for delayed card update API
  action: {
    tag: string;
    value: CardActionValue;
    option?: string;
  };
}

export interface CardActionValue {
  key: "project_select" | "branch_select" | "only_build" | "build_release" | "refresh_branches";
}

// Feishu API types

export interface TenantTokenResponse {
  code: number;
  msg: string;
  tenant_access_token: string;
  expire: number;
}

// GitHub API types

export interface GitHubBranch {
  name: string;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: string; // "queued" | "in_progress" | "completed"
  conclusion: string | null; // "success" | "failure" | "cancelled" | null
  html_url: string;
  created_at: string;
}

// Multi-project config

export interface ProjectConfig {
  name: string;
  owner: string;
  repo: string;
  workflowId: string;
  inputs?: {
    only_build?: Record<string, string>;
    build_release?: Record<string, string>;
  };
}

interface CardEntry {
  project?: string;
  branch?: string;
  expiresAt: number;
}

interface RunEntry {
  chatId: string;
  openId: string;
  branch: string;
  projectName: string;
  repo: string;
  modeStr: string;
  imageTag?: string;
  expiresAt: number;
}

const store = new Map<string, CardEntry>();
const runStore = new Map<number, RunEntry>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes
const RUN_TTL_MS = 60 * 60 * 1000; // 1 hour (builds may take a while)

// Cleanup expired entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
  for (const [key, entry] of runStore) {
    if (now > entry.expiresAt) runStore.delete(key);
  }
}, 60_000);

function ensureEntry(openMessageId: string): CardEntry {
  let entry = store.get(openMessageId);
  if (!entry || Date.now() > entry.expiresAt) {
    entry = { expiresAt: Date.now() + TTL_MS };
    store.set(openMessageId, entry);
  }
  return entry;
}

export function setProject(openMessageId: string, project: string): void {
  const entry = ensureEntry(openMessageId);
  entry.project = project;
  // Clear branch when project changes
  entry.branch = undefined;
}

export function getProject(openMessageId: string): string | null {
  const entry = store.get(openMessageId);
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(openMessageId);
    return null;
  }
  return entry.project ?? null;
}

export function setBranch(openMessageId: string, branch: string): void {
  const entry = ensureEntry(openMessageId);
  entry.branch = branch;
}

export function getBranch(openMessageId: string): string | null {
  const entry = store.get(openMessageId);
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(openMessageId);
    return null;
  }
  return entry.branch ?? null;
}

export function remove(openMessageId: string): void {
  store.delete(openMessageId);
}

export function setRunContext(
  runId: number,
  chatId: string,
  openId: string,
  branch: string,
  projectName: string,
  repo: string,
  modeStr: string,
  imageTag?: string
): void {
  runStore.set(runId, {
    chatId,
    openId,
    branch,
    projectName,
    repo,
    modeStr,
    imageTag,
    expiresAt: Date.now() + RUN_TTL_MS,
  });
}

export function getRunContext(
  runId: number
): { chatId: string; openId: string; branch: string; projectName: string; repo: string; modeStr: string; imageTag?: string } | null {
  const entry = runStore.get(runId);
  if (!entry || Date.now() > entry.expiresAt) {
    runStore.delete(runId);
    return null;
  }
  return { chatId: entry.chatId, openId: entry.openId, branch: entry.branch, projectName: entry.projectName, repo: entry.repo, modeStr: entry.modeStr, imageTag: entry.imageTag };
}

export function removeRunContext(runId: number): void {
  runStore.delete(runId);
}

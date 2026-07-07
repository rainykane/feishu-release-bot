interface CardEntry {
  branch: string;
  expiresAt: number;
}

const store = new Map<string, CardEntry>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup expired entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 60_000);

export function setBranch(openMessageId: string, branch: string): void {
  store.set(openMessageId, { branch, expiresAt: Date.now() + TTL_MS });
}

export function getBranch(openMessageId: string): string | null {
  const entry = store.get(openMessageId);
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(openMessageId);
    return null;
  }
  return entry.branch;
}

export function remove(openMessageId: string): void {
  store.delete(openMessageId);
}

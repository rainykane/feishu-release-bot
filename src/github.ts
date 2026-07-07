import { config } from "./config";
import type { GitHubBranch } from "./types";

const apiBase = "https://api.github.com";

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.github.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

export async function listBranches(): Promise<string[]> {
  const url = `${apiBase}/repos/${config.github.owner}/${config.github.repo}/branches?per_page=30`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`list branches: ${res.status} ${body}`);
  }
  const branches: GitHubBranch[] = await res.json();
  return branches.map((b) => b.name);
}

export async function triggerWorkflow(
  branch: string,
  buildOnly: boolean
): Promise<void> {
  const url = `${apiBase}/repos/${config.github.owner}/${config.github.repo}/actions/workflows/${config.github.workflowId}/dispatches`;

  const body = JSON.stringify({
    ref: branch,
    inputs: {
      only_build_image: buildOnly,
      commit: "",
      image_tag: "",
    },
  });

  const res = await fetch(url, { method: "POST", headers: headers(), body });
  if (res.status !== 204) {
    const respBody = await res.text();
    throw new Error(`trigger workflow: ${res.status} ${respBody}`);
  }
}

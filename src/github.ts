import { config } from "./config";
import type { GitHubBranch, GitHubWorkflowRun, ProjectConfig } from "./types";

const apiBase = "https://api.github.com";

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.github.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

export async function listBranches(project: ProjectConfig): Promise<string[]> {
  const allBranches: GitHubBranch[] = [];
  let page = 1;

  while (true) {
    const url = `${apiBase}/repos/${project.owner}/${project.repo}/branches?per_page=100&page=${page}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`list branches: ${res.status} ${body}`);
    }
    const branches: GitHubBranch[] = await res.json();
    allBranches.push(...branches);

    // Check if there are more pages via the Link header
    const linkHeader = res.headers.get("link");
    if (!linkHeader || !linkHeader.includes('rel="next"')) break;
    page++;
  }

  return allBranches.map((b) => b.name);
}

export async function triggerWorkflow(
  project: ProjectConfig,
  branch: string,
  buildOnly: boolean
): Promise<void> {
  const url = `${apiBase}/repos/${project.owner}/${project.repo}/actions/workflows/${project.workflowId}/dispatches`;

  const inputs: Record<string, string> = project.inputs
    ? { ...project.inputs }
    : {
        only_build_image: String(buildOnly),
        commit: "",
        image_tag: "",
      };

  const body = JSON.stringify({ ref: branch, inputs });

  const res = await fetch(url, { method: "POST", headers: headers(), body });
  if (res.status !== 204) {
    const respBody = await res.text();
    throw new Error(`trigger workflow: ${res.status} ${respBody}`);
  }
}

export async function getLatestRun(
  project: ProjectConfig,
  branch: string
): Promise<GitHubWorkflowRun | null> {
  const url = `${apiBase}/repos/${project.owner}/${project.repo}/actions/workflows/${project.workflowId}/runs?branch=${encodeURIComponent(branch)}&per_page=1`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`get latest run: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { workflow_runs: GitHubWorkflowRun[] };
  const runs = data.workflow_runs;
  return runs.length > 0 ? runs[0] : null;
}

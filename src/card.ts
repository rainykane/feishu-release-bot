import type { ProjectConfig } from "./types";

export function buildReleaseCard(
  projects: ProjectConfig[],
  branches: string[],
  selectedProject?: string
): string {
  const projectOptions = projects.map((p) => ({
    text: { tag: "plain_text", content: p.name },
    value: p.name,
  }));

  const branchOptions = branches.map((b) => ({
    text: { tag: "plain_text", content: b },
    value: b,
  }));

  const elements: any[] = [];

  // Project dropdown
  const projectSelect: any = {
    tag: "select_static",
    placeholder: { tag: "plain_text", content: "Choose a project" },
    value: { key: "project_select" },
    options: projectOptions,
  };
  if (selectedProject) {
    projectSelect.initial_value = selectedProject;
  }
  elements.push({
    tag: "action",
    actions: [projectSelect],
  });

  // Branch dropdown
  const branchPlaceholder =
    branches.length > 0
      ? "Choose a branch"
      : selectedProject
        ? "Loading branches..."
        : "Choose a project first";

  elements.push({
    tag: "action",
    actions: [
      {
        tag: "select_static",
        placeholder: { tag: "plain_text", content: branchPlaceholder },
        value: { key: "branch_select" },
        options: branchOptions,
      },
    ],
  });

  // Build buttons
  elements.push({ tag: "hr" });
  elements.push({
    tag: "action",
    actions: [
      {
        tag: "button",
        text: { tag: "plain_text", content: "📦 Only Build" },
        type: "primary",
        value: { key: "only_build" },
      },
      {
        tag: "button",
        text: { tag: "plain_text", content: "🚀 Build & Release" },
        type: "danger",
        value: { key: "build_release" },
      },
    ],
  });
  elements.push({ tag: "hr" });
  elements.push({
    tag: "action",
    actions: [
      {
        tag: "button",
        text: { tag: "plain_text", content: "🔄 Refresh Branches" },
        type: "default",
        value: { key: "refresh_branches" },
      },
    ],
  });
  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: "Select a project and branch, then click a build button.",
      },
    ],
  });

  return JSON.stringify({
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: { tag: "plain_text", content: "🚀 Trigger Release Build" },
      template: "blue",
    },
    elements,
  });
}

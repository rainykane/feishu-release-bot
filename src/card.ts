import { config } from "./config";
import type { ProjectConfig } from "./types";

function hasReleaseMode(project?: ProjectConfig): boolean {
  if (!project) return false;
  if (!project.inputs) return true; // default inputs support both modes
  return project.inputs.build_release !== undefined;
}

export function buildReleaseCard(
  projects: ProjectConfig[],
  branches: string[],
  selectedProject?: ProjectConfig
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
  elements.push({
    tag: "div",
    text: { tag: "lark_md", content: "**项目:**" },
  });
  const projectSelect: any = {
    tag: "select_static",
    placeholder: { tag: "plain_text", content: "Choose a project" },
    value: { key: "project_select" },
    options: projectOptions,
  };
  if (selectedProject) {
    projectSelect.initial_option = selectedProject.name;
  }
  elements.push({
    tag: "action",
    actions: [projectSelect],
  });

  // Branch dropdown
  elements.push({
    tag: "div",
    text: { tag: "lark_md", content: "**分支:**" },
  });
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

  // Refresh branches button
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

  elements.push({ tag: "hr" });

  // Build buttons
  const buildActions: any[] = [
    {
      tag: "button",
      text: { tag: "plain_text", content: "构建" },
      type: "primary",
      value: { key: "only_build" },
    },
  ];

  if (hasReleaseMode(selectedProject)) {
    buildActions.push({
      tag: "button",
      text: { tag: "plain_text", content: "🚀 Build & Release" },
      type: "danger",
      value: { key: "build_release" },
    });
  }

  elements.push({
    tag: "action",
    actions: buildActions,
  });

  return JSON.stringify({
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: {
        tag: "plain_text",
        content: `打包助手 - ${config.version}`,
      },
      template: "blue",
    },
    elements,
  });
}

import type { ProjectConfig } from "./types";

function hasReleaseMode(project?: ProjectConfig): boolean {
  if (!project) return false;
  if (!project.inputs) return true;
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

  // Row 1: project dropdown (label embedded in placeholder)
  const projectSelect: any = {
    tag: "select_static",
    placeholder: { tag: "plain_text", content: "选择要构建的项目" },
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

  // Row 2: branch dropdown + refresh button
  const branchActions: any[] = [
    {
      tag: "select_static",
      placeholder: { tag: "plain_text", content: "选择分支" },
      value: { key: "branch_select" },
      options: branchOptions,
    },
    {
      tag: "button",
      text: { tag: "plain_text", content: "🔄 刷新" },
      type: "default",
      value: { key: "refresh_branches" },
    },
  ];

  elements.push({
    tag: "action",
    actions: branchActions,
  });

  elements.push({ tag: "hr" });

  // Build buttons
  const buildActions: any[] = [
    {
      tag: "button",
      text: {
        tag: "plain_text",
        content: selectedProject?.buttonText?.only_build ?? "🔨 构建",
      },
      type: "primary",
      value: { key: "only_build" },
    },
  ];

  if (hasReleaseMode(selectedProject)) {
    buildActions.push({
      tag: "button",
      text: {
        tag: "plain_text",
        content: selectedProject?.buttonText?.build_release ?? "🚀 构建并发布",
      },
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
        content: "全世界最好的Builder ⭐️",
      },
      template: "purple",
    },
    elements,
  });
}

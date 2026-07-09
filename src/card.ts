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

  // Row 1: 项目: [dropdown]
  const projectSelect: any = {
    tag: "select_static",
    placeholder: { tag: "plain_text", content: "Choose a project" },
    width: "fill",
    value: { key: "project_select" },
    options: projectOptions,
  };
  if (selectedProject) {
    projectSelect.initial_option = selectedProject.name;
  }
  elements.push({
    tag: "column_set",
    flex_mode: "none",
    columns: [
      {
        tag: "column",
        width: "auto",
        elements: [
          {
            tag: "div",
            text: { tag: "lark_md", content: "**项目:**" },
          },
        ],
      },
      {
        tag: "column",
        width: "weighted",
        weight: 1,
        elements: [
          {
            tag: "action",
            actions: [projectSelect],
          },
        ],
      },
    ],
  });

  // Row 2: 分支: [dropdown] [刷新]
  const branchPlaceholder =
    branches.length > 0
      ? "Choose a branch"
      : selectedProject
        ? "Loading branches..."
        : "Choose a project first";

  const branchAction: any = {
    tag: "select_static",
    placeholder: { tag: "plain_text", content: branchPlaceholder },
    width: "fill",
    value: { key: "branch_select" },
    options: branchOptions,
  };

  elements.push({
    tag: "column_set",
    flex_mode: "none",
    columns: [
      {
        tag: "column",
        width: "auto",
        elements: [
          {
            tag: "div",
            text: { tag: "lark_md", content: "**分支:**" },
          },
        ],
      },
      {
        tag: "column",
        width: "weighted",
        weight: 1,
        elements: [
          {
            tag: "action",
            actions: [
              branchAction,
              {
                tag: "button",
                text: { tag: "plain_text", content: "刷新" },
                type: "default",
                value: { key: "refresh_branches" },
              },
            ],
          },
        ],
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
        content: "全世界最好的Builder",
      },
      template: "purple",
    },
    elements,
  });
}

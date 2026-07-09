import type { ProjectConfig } from "./types";

export function buildReleaseCard(
  projects: ProjectConfig[],
  branches: string[],
  selectedProject?: string
): string {
  const branchOptions = branches.map((b) => ({
    text: { tag: "plain_text", content: b },
    value: b,
  }));

  const elements: any[] = [];

  if (selectedProject) {
    // State 2: project selected — show project name + change button
    elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content: `Project: **${selectedProject}**`,
      },
    });
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "↩ Change Project" },
          type: "default",
          value: { key: "change_project" },
        },
      ],
    });
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "select_static",
          placeholder: {
            tag: "plain_text",
            content: "Choose a branch",
          },
          value: { key: "branch_select" },
          options: branchOptions,
        },
      ],
    });
  } else {
    // State 1: no project selected — show project buttons
    elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content: "Select a project:",
      },
    });
    const projectButtons = projects.map((p) => ({
      tag: "button",
      text: { tag: "plain_text", content: p.name },
      type: "primary",
      value: { key: "project_select", project: p.name },
    }));
    elements.push({
      tag: "action",
      actions: projectButtons,
    });
    // Empty branch dropdown (disabled UX)
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "select_static",
          placeholder: {
            tag: "plain_text",
            content: "Choose a branch (select project first)",
          },
          value: { key: "branch_select" },
          options: [],
        },
      ],
    });
  }

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
        content: selectedProject
          ? "Select a branch and click a build button."
          : "Select a project first, then choose a branch. Only Build: builds the Docker image. Build & Release: builds image + publishes GitHub Release.",
      },
    ],
  });

  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "🚀 Trigger Release Build" },
      template: "blue",
    },
    elements,
  });
}

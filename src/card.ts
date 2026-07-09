import type { ProjectConfig } from "./types";

export function buildReleaseCard(
  projects: ProjectConfig[],
  branches: string[]
): string {
  const projectOptions = projects.map((p) => ({
    text: { tag: "plain_text", content: p.name },
    value: p.name,
  }));

  const branchOptions = branches.map((b) => ({
    text: { tag: "plain_text", content: b },
    value: b,
  }));

  const card = {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "🚀 Trigger Release Build" },
      template: "blue",
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: "Select the project and branch to build:",
        },
      },
      {
        tag: "action",
        actions: [
          {
            tag: "select_static",
            placeholder: {
              tag: "plain_text",
              content: "Choose a project",
            },
            value: { key: "project_select" },
            options: projectOptions,
          },
        ],
      },
      {
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
      },
      { tag: "hr" },
      {
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
      },
      { tag: "hr" },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "🔄 Refresh Branches" },
            type: "default",
            value: { key: "refresh_branches" },
          },
        ],
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content:
              "Select a project first, then choose a branch. Only Build: builds the Docker image. Build & Release: builds image + publishes GitHub Release.",
          },
        ],
      },
    ],
  };

  return JSON.stringify(card);
}

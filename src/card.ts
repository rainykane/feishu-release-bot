export function buildReleaseCard(branches: string[]): string {
  const options = branches.map((b) => ({
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
          content: "Select the branch to build and release from:",
        },
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
            options,
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
              "Only Build: just builds the Docker image. Build & Release: builds image + publishes GitHub Release.",
          },
        ],
      },
    ],
  };

  return JSON.stringify(card);
}

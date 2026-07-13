import type { Task } from "@keidai/shared";

/** Sample Task shape for reference — authoring happens in keidai-ui. */
export const BOOT_TASK: Task = {
  goal: `Pull together a status report on keidai from Linear, GitHub, and Notion, then create a Gmail draft to the owner.
The repo is located at https://github.com/nathanlb/keidai.`,
  trigger: { type: "now" },
  assignee: "shaiden-newsletter-01",
};

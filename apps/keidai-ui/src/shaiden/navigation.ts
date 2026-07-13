import type { LucideIcon } from "lucide-react";
import { ListChecks, Workflow } from "lucide-react";
import type { AppShellBreadcrumbSegment } from "../shell/types/index.js";

export const TASKS_PATH = "/shaiden/tasks";
export const NEW_TASK_PARAM = "new_task";
/** Opens the task authoring dialog over Runs. */
export const NEW_TASK_HREF = `/shaiden/runs?${NEW_TASK_PARAM}=1`;

export interface ShaidenNavItem {
  path: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  breadcrumb?: AppShellBreadcrumbSegment[];
  showRefresh?: boolean;
}

export const shaidenNavItems: ShaidenNavItem[] = [
  {
    path: TASKS_PATH,
    label: "Tasks",
    title: "New task",
    description:
      "Define a goal, pick an agent, and run it. Tasks are authored here and execute on the assigned agent.",
    icon: ListChecks,
    showRefresh: false,
  },
  {
    path: "/shaiden/runs",
    label: "Runs",
    title: "Runs",
    description:
      "Step sequence, tool calls, and termination outcome for each harness run.",
    icon: Workflow,
  },
];

export function findShaidenNavItem(
  pathname: string,
): ShaidenNavItem | undefined {
  return shaidenNavItems.find((item) => item.path === pathname);
}

import type { LucideIcon } from "lucide-react";
import { Workflow } from "lucide-react";

export interface ShaidenNavItem {
  path: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export const shaidenNavItems: ShaidenNavItem[] = [
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

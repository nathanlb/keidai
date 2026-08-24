import type { LucideIcon } from "lucide-react";
import { Bot } from "lucide-react";
import { AGENTS_PATH } from "../shell/navigation.js";

export { AGENTS_PATH };

export interface FudaNavItem {
  path: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export const fudaNavItems: FudaNavItem[] = [
  {
    path: AGENTS_PATH,
    label: "Agents",
    title: "Agents",
    description:
      "Who an agent is, what it may do, and which processes may act as it.",
    icon: Bot,
  },
];

export function isFudaAgentsRoute(pathname: string): boolean {
  return pathname === AGENTS_PATH || pathname.startsWith(`${AGENTS_PATH}/`);
}

export function findFudaNavItem(pathname: string): FudaNavItem | undefined {
  if (isFudaAgentsRoute(pathname)) {
    return fudaNavItems.find((item) => item.path === AGENTS_PATH);
  }
  return fudaNavItems.find((item) => item.path === pathname);
}

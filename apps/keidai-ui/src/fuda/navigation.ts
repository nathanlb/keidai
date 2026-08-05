import type { LucideIcon } from "lucide-react";
import { Bot, KeyRound } from "lucide-react";

export const AGENTS_PATH = "/agents";
export const BEARERS_PATH = "/bearers";

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
  {
    path: BEARERS_PATH,
    label: "Bearers",
    title: "Bearers",
    description:
      "Named principals a subject credential maps to. Grants decide which agents each may become.",
    icon: KeyRound,
  },
];

export function isFudaAgentsRoute(pathname: string): boolean {
  return pathname === AGENTS_PATH || pathname.startsWith(`${AGENTS_PATH}/`);
}

export function isFudaBearersRoute(pathname: string): boolean {
  return pathname === BEARERS_PATH || pathname.startsWith(`${BEARERS_PATH}/`);
}

export function isFudaManagedRoute(pathname: string): boolean {
  return isFudaAgentsRoute(pathname) || isFudaBearersRoute(pathname);
}

export function findFudaNavItem(pathname: string): FudaNavItem | undefined {
  if (isFudaAgentsRoute(pathname)) {
    return fudaNavItems.find((item) => item.path === AGENTS_PATH);
  }
  if (isFudaBearersRoute(pathname)) {
    return fudaNavItems.find((item) => item.path === BEARERS_PATH);
  }
  return fudaNavItems.find((item) => item.path === pathname);
}

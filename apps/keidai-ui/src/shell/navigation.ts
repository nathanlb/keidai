import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  Cable,
  House,
  KeyRound,
  ListChecks,
  Play,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

export const HOME_PATH = "/home";
export const AGENTS_PATH = "/agents";
export const TASKS_PATH = "/tasks";
export const RUNS_PATH = "/runs";
export const APPROVALS_PATH = "/approvals";
export const ACTIVITY_PATH = "/activity";
export const CONFIGURE_PATH = "/configure";
export const CONNECTIONS_PATH = "/configure/connections";
export const PROVIDERS_PATH = "/configure/providers";
export const GROUPS_PATH = "/configure/groups";

export type NavMode = "workspace" | "configure";

export interface AppNavItem {
  path: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  configChip?: string;
  showRefresh?: boolean;
  suppressPageHeader?: boolean;
  isActive: (pathname: string) => boolean;
}

function exact(path: string): (pathname: string) => boolean {
  return (pathname) => pathname === path;
}

function prefix(path: string): (pathname: string) => boolean {
  return (pathname) => pathname === path || pathname.startsWith(`${path}/`);
}

export const homeNavItem: AppNavItem = {
  path: HOME_PATH,
  label: "Home",
  title: "Home",
  description: "What needs you, what's running, and whether the work succeeded.",
  icon: House,
  showRefresh: false,
  isActive: exact(HOME_PATH),
};

export const operateNavItems: AppNavItem[] = [
  {
    path: AGENTS_PATH,
    label: "Agents",
    title: "Agents",
    description:
      "Who an agent is, what it may do, and which processes may act as it.",
    icon: Bot,
    suppressPageHeader: true,
    isActive: prefix(AGENTS_PATH),
  },
  {
    path: TASKS_PATH,
    label: "Tasks",
    title: "Tasks",
    description:
      "Saved task definitions. Re-run a goal or author a new one for the assigned agent.",
    icon: ListChecks,
    showRefresh: true,
    isActive: prefix(TASKS_PATH),
  },
  {
    path: RUNS_PATH,
    label: "Runs",
    title: "Runs",
    description:
      "Step sequence, tool calls, and termination outcome for each harness run.",
    icon: Play,
    isActive: prefix(RUNS_PATH),
  },
  {
    path: APPROVALS_PATH,
    label: "Approvals",
    title: "Approvals",
    description:
      "Gated tool calls parked for your decision, sourced from Torii. They stay here until you act — no auto-expiry.",
    icon: ShieldCheck,
    isActive: exact(APPROVALS_PATH),
  },
  {
    path: ACTIVITY_PATH,
    label: "Gateway activity",
    title: "Gateway activity",
    description:
      "Chronological CallTrace stream — what each agent invoked, under which owner, and how policy and credentials resolved.",
    icon: Activity,
    isActive: exact(ACTIVITY_PATH),
  },
];

export const configureNavItems: AppNavItem[] = [
  {
    path: CONNECTIONS_PATH,
    label: "Connections",
    title: "Connections",
    description: "Backend MCP servers wired into the gateway.",
    icon: Cable,
    configChip: "torii.yaml",
    isActive: exact(CONNECTIONS_PATH),
  },
  {
    path: PROVIDERS_PATH,
    label: "OAuth providers",
    title: "OAuth providers",
    description:
      "Standing grants the owner links once. Torii stores, refreshes, and injects per call.",
    icon: KeyRound,
    configChip: "torii.yaml",
    isActive: exact(PROVIDERS_PATH),
  },
  {
    path: GROUPS_PATH,
    label: "Groups & tools",
    title: "Groups & tools",
    description:
      "Which tools each group may use, and which agents inherit that policy.",
    icon: UsersRound,
    showRefresh: false,
    suppressPageHeader: true,
    isActive: prefix(GROUPS_PATH),
  },
];

const allNavItems: AppNavItem[] = [
  homeNavItem,
  ...operateNavItems,
  ...configureNavItems,
];

export function resolveNavMode(pathname: string): NavMode {
  return pathname === CONFIGURE_PATH || pathname.startsWith(`${CONFIGURE_PATH}/`)
    ? "configure"
    : "workspace";
}

export function resolveAppNav(pathname: string): AppNavItem | undefined {
  return allNavItems.find((item) => item.isActive(pathname));
}

export function resolveAppSection(pathname: string): string {
  if (resolveNavMode(pathname) === "configure") {
    return "Configure";
  }
  return "";
}

export function isNavItemActive(item: AppNavItem, pathname: string): boolean {
  return item.isActive(pathname);
}

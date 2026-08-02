import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Cable,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

export interface ToriiNavItem {
  path: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export const toriiNavItems: ToriiNavItem[] = [
  {
    path: "/connections",
    label: "Connections",
    title: "Connections",
    description: "Backend connection health for Torii.",
    icon: Cable,
  },
  {
    path: "/oauth-providers",
    label: "OAuth providers",
    title: "OAuth providers",
    description:
      "Standing grants the owner links once. Torii stores, refreshes, and injects per call.",
    icon: KeyRound,
  },
  {
    path: "/approvals",
    label: "Approvals",
    title: "Approvals",
    description:
      "Gated tool calls parked for your decision, sourced from Torii. They stay here until you act — no auto-expiry.",
    icon: ShieldCheck,
  },
  {
    path: "/activity",
    label: "Activity & traces",
    title: "Activity & traces",
    description:
      "Chronological CallTrace stream — what each agent invoked, under which owner, and how policy and credentials resolved.",
    icon: Activity,
  },
];

export function findToriiNavItem(pathname: string): ToriiNavItem | undefined {
  return toriiNavItems.find((item) => item.path === pathname);
}

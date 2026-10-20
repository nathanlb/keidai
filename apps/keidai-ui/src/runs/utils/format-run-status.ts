import type { StatusTone } from "../../lib/types/status-tone.js";
import type {
  RunDisplayStatus,
  RunStatusFilter,
} from "./derive-run-display-status.js";

export interface RunStatusMeta {
  label: string;
  tone: StatusTone;
  badgeClass: string;
  dotClass?: string;
}

export const RUN_STATUS_META: Record<RunDisplayStatus, RunStatusMeta> = {
  running: {
    label: "Running",
    tone: "info",
    badgeClass: "border-border bg-background text-foreground",
    dotClass: "bg-muted-foreground",
  },
  waiting_approval: {
    label: "Awaiting review",
    tone: "warning",
    badgeClass: "border-warning/40 bg-warning/10 text-foreground",
    dotClass: "bg-warning",
  },
  goal_met: {
    label: "Goal met",
    tone: "success",
    badgeClass: "border-transparent bg-secondary text-secondary-foreground",
    dotClass: "bg-success",
  },
  failed: {
    label: "Failed",
    tone: "error",
    badgeClass: "border-transparent bg-destructive text-destructive-foreground",
    dotClass: "bg-destructive",
  },
  iteration_exhausted: {
    label: "Iteration exhausted",
    tone: "neutral",
    badgeClass: "border-border bg-background text-foreground",
    dotClass: "bg-muted-foreground",
  },
  timeout: {
    label: "Timeout",
    tone: "warning",
    badgeClass: "border-warning/40 bg-warning/10 text-foreground",
    dotClass: "bg-warning",
  },
  human_reject: {
    label: "Rejected",
    tone: "error",
    badgeClass: "border-transparent bg-destructive text-destructive-foreground",
    dotClass: "bg-destructive",
  },
  stopped: {
    label: "Stopped",
    tone: "neutral",
    badgeClass: "border-border bg-muted/60 text-foreground",
    dotClass: "bg-foreground/50",
  },
};

export const RUN_STATUS_CHIP_ORDER = [
  "all",
  "running",
  "waiting_approval",
  "goal_met",
  "terminated",
  "failed",
] as const satisfies readonly RunStatusFilter[];

export function runStatusChipLabel(filter: RunStatusFilter): string {
  switch (filter) {
    case "all":
      return "All";
    case "running":
      return "Running";
    case "waiting_approval":
      return "Awaiting review";
    case "goal_met":
      return "Goal met";
    case "terminated":
      return "Terminated";
    case "failed":
      return "Failed";
  }
}

export function runStatusChipDotClass(
  filter: RunStatusFilter,
): string | undefined {
  switch (filter) {
    case "running":
      return "bg-muted-foreground";
    case "waiting_approval":
      return "bg-warning";
    case "goal_met":
      return "bg-success";
    case "failed":
      return "bg-destructive";
    case "terminated":
      return "bg-muted-foreground";
    default:
      return undefined;
  }
}

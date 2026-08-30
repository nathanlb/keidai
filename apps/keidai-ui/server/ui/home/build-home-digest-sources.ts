import type { ApprovalRecordView, RunReport } from "@keidai/shared";
import type {
  HomeDigestSourcesResponse,
} from "./home-digest.dto.js";
import type { RunVisibilityListItem } from "../runs/runs-visibility.dto.js";

export function collectRunningRunIds(
  approvals: readonly ApprovalRecordView[],
  runs: readonly RunVisibilityListItem[],
): string[] {
  const parkedRunIds = new Set(
    approvals.flatMap((record) =>
      record.status === "pending" && record.runId ? [record.runId] : [],
    ),
  );

  return runs
    .filter((run) => run.status === "running" && !parkedRunIds.has(run.id))
    .map((run) => run.id);
}

export function buildHomeDigestSourcesResponse(
  input: Omit<HomeDigestSourcesResponse, "runReports"> & {
    runReports: Readonly<Record<string, RunReport>>;
  },
): HomeDigestSourcesResponse {
  return {
    approvals: [...input.approvals],
    runs: [...input.runs],
    runReports: { ...input.runReports },
    tasks: [...input.tasks],
    agents: [...input.agents],
    groups: [...input.groups],
    servers: [...input.servers],
    connections: [...input.connections],
  };
}

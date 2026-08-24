import type { GroupView, RunReport } from "@keidai/shared";
import { LIST_BUFFER_LIMIT } from "../../lib/constants/list-limits.js";
import { fetchAgents } from "../../lib/api/agents.js";
import { fetchRunsVisibility } from "../../lib/api/runs.js";
import { fetchRun } from "../../lib/api/runs.js";
import { fetchTasks } from "../../lib/api/tasks.js";
import { fetchApprovals, fetchGroups } from "../../lib/api/gateway.js";
import type { HomeDigestSources } from "../utils/build-home-digest.js";

export async function fetchHomeDigestSources(): Promise<HomeDigestSources> {
  const [approvals, runsResponse, tasksResponse, agentsResponse, groups] =
    await Promise.all([
      fetchApprovals({ limit: LIST_BUFFER_LIMIT }),
      fetchRunsVisibility({ limit: LIST_BUFFER_LIMIT }),
      fetchTasks({ limit: LIST_BUFFER_LIMIT }),
      fetchAgents(),
      fetchGroups().catch((): { groups: GroupView[] } => ({ groups: [] })),
    ]);

  const parkedRunIds = new Set(
    approvals.flatMap((record) =>
      record.status === "pending" && record.runId ? [record.runId] : [],
    ),
  );
  const runningIds = runsResponse.runs
    .filter((run) => run.status === "running" && !parkedRunIds.has(run.id))
    .map((run) => run.id);

  const entries = await Promise.all(
    runningIds.map(async (id): Promise<[string, RunReport] | null> => {
      try {
        return [id, await fetchRun(id)];
      } catch {
        return null;
      }
    }),
  );

  const runReports: Record<string, RunReport> = {};
  for (const entry of entries) {
    if (entry) {
      runReports[entry[0]] = entry[1];
    }
  }

  return {
    approvals,
    runs: runsResponse.runs,
    runReports,
    tasks: tasksResponse.tasks,
    agents: agentsResponse.agents,
    groups: groups.groups,
  };
}

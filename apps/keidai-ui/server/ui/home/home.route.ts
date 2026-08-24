import type {
  ApprovalRecordView,
  GroupView,
  GroupsResponse,
  RunReport,
  RunsResponse,
  TasksResponse,
} from "@keidai/shared";
import type { FastifyInstance } from "fastify";
import type { OperatorApiBackends } from "../../create-server.js";
import {
  fetchManagementApiJson,
  UpstreamRequestError,
} from "../../upstream/fetch-management-api.js";
import { buildRunsVisibilityResponse } from "../runs/build-runs-visibility-response.js";
import type { HomeDigestAgent } from "./home-digest.dto.js";
import {
  buildHomeDigestSourcesResponse,
  collectRunningRunIds,
} from "./build-home-digest-sources.js";
import type { HomeDigestSourcesResponse } from "./home-digest.dto.js";
import { HOME_DIGEST_LIST_LIMIT } from "./home-digest.dto.js";

export interface RegisterHomeDigestRouteOptions {
  backends: OperatorApiBackends;
  bffServiceToken: string | null;
}

function parseLimitQuery(value: unknown): number {
  if (value === undefined) {
    return HOME_DIGEST_LIST_LIMIT;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return HOME_DIGEST_LIST_LIMIT;
  }

  return Math.floor(parsed);
}

function listQueryPath(basePath: string, limit: number): string {
  return `${basePath}?limit=${encodeURIComponent(String(limit))}`;
}

async function fetchRunReport(
  backends: OperatorApiBackends,
  bffServiceToken: string | null,
  runId: string,
): Promise<RunReport | null> {
  try {
    return await fetchManagementApiJson<RunReport>(
      backends.shaiden,
      `/api/runs/${encodeURIComponent(runId)}`,
      { bffServiceToken },
    );
  } catch {
    return null;
  }
}

async function fetchGroupsOrEmpty(
  backends: OperatorApiBackends,
  bffServiceToken: string | null,
): Promise<GroupView[]> {
  try {
    const response = await fetchManagementApiJson<GroupsResponse>(
      backends.torii,
      "/api/groups",
      { bffServiceToken },
    );
    return response.groups;
  } catch {
    return [];
  }
}

export async function registerHomeDigestRoute(
  app: FastifyInstance,
  options: RegisterHomeDigestRouteOptions,
): Promise<void> {
  const { backends, bffServiceToken } = options;

  app.get<{
    Querystring: { limit?: string };
    Reply: HomeDigestSourcesResponse | { error: string };
  }>("/api/ui/home/digest", async (request, reply) => {
    const limit = parseLimitQuery(request.query.limit);
    const runsPath = listQueryPath("/api/runs", limit);
    const tasksPath = listQueryPath("/api/tasks", limit);
    const approvalsPath = listQueryPath("/api/approvals", limit);

    try {
      const [approvals, rawRuns, tasksResponse, agentsResponse, groups] =
        await Promise.all([
          fetchManagementApiJson<ApprovalRecordView[]>(
            backends.torii,
            approvalsPath,
            { bffServiceToken },
          ),
          fetchManagementApiJson<RunsResponse>(backends.shaiden, runsPath, {
            bffServiceToken,
          }),
          fetchManagementApiJson<TasksResponse>(backends.shaiden, tasksPath, {
            bffServiceToken,
          }),
          fetchManagementApiJson<{ agents: HomeDigestAgent[] }>(
            backends.fuda,
            "/api/agents",
            { bffServiceToken },
          ),
          fetchGroupsOrEmpty(backends, bffServiceToken),
        ]);

      const runsResponse = buildRunsVisibilityResponse(
        rawRuns,
        agentsResponse.agents,
      );
      const runningIds = collectRunningRunIds(approvals, runsResponse.runs);
      const reportEntries = await Promise.all(
        runningIds.map(async (runId) => {
          const report = await fetchRunReport(
            backends,
            bffServiceToken,
            runId,
          );
          return report ? ([runId, report] as const) : null;
        }),
      );

      const runReports: Record<string, RunReport> = {};
      for (const entry of reportEntries) {
        if (entry) {
          runReports[entry[0]] = entry[1];
        }
      }

      return buildHomeDigestSourcesResponse({
        approvals,
        runs: runsResponse.runs,
        runReports,
        tasks: tasksResponse.tasks,
        agents: agentsResponse.agents,
        groups,
      });
    } catch (error) {
      if (error instanceof UpstreamRequestError) {
        return reply.code(502).send({
          error: `Failed to load home digest from ${error.upstream}`,
        });
      }

      throw error;
    }
  });
}

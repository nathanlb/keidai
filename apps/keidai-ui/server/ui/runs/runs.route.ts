import type {
  RunAttemptSummary,
  RunAttemptsResponse,
  RunsResponse,
} from "@keidai/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { OperatorApiBackends } from "../../create-server.js";
import {
  fetchManagementApiJson,
  UpstreamRequestError,
} from "../../upstream/fetch-management-api.js";
import { requestOperator, runsVisibleToOperator } from "../operator-scope.js";
import { buildRunsVisibilityResponse } from "./build-runs-visibility-response.js";
import type {
  FudaManagementAgent,
  RunsVisibilityResponse,
} from "./runs-visibility.dto.js";

export interface RegisterShaidenRunsRouteOptions {
  backends: OperatorApiBackends;
  bffServiceToken: string | null;
}

function parseLimitQuery(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.floor(parsed);
}

export async function registerShaidenRunsRoute(
  app: FastifyInstance,
  options: RegisterShaidenRunsRouteOptions,
): Promise<void> {
  const { backends, bffServiceToken } = options;

  app.get<{
    Querystring: { limit?: string };
    Reply: RunsVisibilityResponse | { error: string };
  }>("/api/ui/shaiden/runs", async (request, reply) => {
    const limit = parseLimitQuery(request.query.limit);
    const runsPath =
      limit === undefined
        ? "/api/runs"
        : `/api/runs?limit=${encodeURIComponent(String(limit))}`;

    const operator = requestOperator(request);

    try {
      const [runsResponse, agentsResponse] = await Promise.all([
        fetchManagementApiJson<RunsResponse>(backends.shaiden, runsPath, {
          bffServiceToken,
          operator,
        }),
        fetchManagementApiJson<{ agents: FudaManagementAgent[] }>(
          backends.fuda,
          "/api/agents",
          { bffServiceToken, operator },
        ),
      ]);

      return buildRunsVisibilityResponse(
        {
          runs: runsVisibleToOperator(
            runsResponse.runs,
            agentsResponse.agents,
            operator,
          ),
        },
        agentsResponse.agents,
      );
    } catch (error) {
      if (error instanceof UpstreamRequestError) {
        return reply.code(502).send({
          error: `Failed to load runs visibility data from ${error.upstream}`,
        });
      }

      throw error;
    }
  });

  app.get<{
    Params: { runId: string };
  }>("/api/ui/runs/:runId/attempts", async (request, reply) => {
    const operator = requestOperator(request);
    if (!operator) {
      return reply.code(401).send({ error: "operator required" });
    }
    return proxyShaiden(reply, () =>
      fetchManagementApiJson<RunAttemptsResponse>(
        backends.shaiden,
        `/api/runs/${encodeURIComponent(request.params.runId)}/attempts`,
        { bffServiceToken, operator },
      ),
    );
  });

  app.put<{
    Params: { runId: string; attemptIndex: string };
  }>(
    "/api/ui/runs/:runId/attempts/:attemptIndex/verdict",
    async (request, reply) => {
      const operator = requestOperator(request);
      if (!operator) {
        return reply.code(401).send({ error: "operator required" });
      }
      return proxyShaiden(reply, () =>
        fetchManagementApiJson<RunAttemptSummary>(
          backends.shaiden,
          verdictPath(request.params.runId, request.params.attemptIndex),
          {
            bffServiceToken,
            operator,
            method: "PUT",
            body: request.body,
          },
        ),
      );
    },
  );

  app.delete<{
    Params: { runId: string; attemptIndex: string };
  }>(
    "/api/ui/runs/:runId/attempts/:attemptIndex/verdict",
    async (request, reply) => {
      const operator = requestOperator(request);
      if (!operator) {
        return reply.code(401).send({ error: "operator required" });
      }
      return proxyShaiden(reply, () =>
        fetchManagementApiJson<RunAttemptSummary>(
          backends.shaiden,
          verdictPath(request.params.runId, request.params.attemptIndex),
          { bffServiceToken, operator, method: "DELETE" },
        ),
      );
    },
  );
}

function clientErrorForUpstreamStatus(status: number): string {
  if (status === 400) {
    return "invalid verdict";
  }
  if (status === 401) {
    return "operator required";
  }
  if (status === 403) {
    return "Forbidden";
  }
  if (status === 404) {
    return "attempt not found";
  }
  return "request failed";
}

function verdictPath(runId: string, attemptIndex: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/attempts/${encodeURIComponent(attemptIndex)}/verdict`;
}

async function proxyShaiden<T>(
  reply: FastifyReply,
  work: () => Promise<T>,
): Promise<T | unknown> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof UpstreamRequestError) {
      if (error.status < 400 || error.status >= 500) {
        return reply.code(502).send({ error: "Shaiden request failed" });
      }
      return reply.code(error.status).send({
        error: clientErrorForUpstreamStatus(error.status),
      });
    }
    throw error;
  }
}

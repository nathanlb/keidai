import type { RunsResponse } from "@keidai/shared";
import type { FastifyInstance } from "fastify";
import type { OperatorApiBackends } from "../../create-server.js";
import {
  fetchManagementApiJson,
  UpstreamRequestError,
} from "../../upstream/fetch-management-api.js";
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

    try {
      const [runsResponse, agentsResponse] = await Promise.all([
        fetchManagementApiJson<RunsResponse>(backends.shaiden, runsPath, {
          bffServiceToken,
        }),
        fetchManagementApiJson<{ agents: FudaManagementAgent[] }>(
          backends.fuda,
          "/api/agents",
          { bffServiceToken },
        ),
      ]);

      return buildRunsVisibilityResponse(
        runsResponse,
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
}

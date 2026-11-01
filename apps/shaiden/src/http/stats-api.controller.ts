import type { Queryable } from "@keidai/postgres";
import {
  readOperatorContext,
  type StatsFilters,
  type Task,
} from "@keidai/shared";
import { taskRevisionHash } from "../runs/task-revision-hash.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  buildAgentStats,
  buildTaskStats,
  type AttemptStatsRow,
} from "../stats/attempt-stats.js";
import {
  attemptOwners,
  currentPersonaVersion,
  queryAttemptStats,
} from "../stats/stats-query.js";
import type { TaskRepository } from "../tasks/types/task-repository.js";

const WINDOWS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
} as const;

export interface StatsApiControllerDeps {
  queryable: Queryable;
  taskRepository: TaskRepository;
}

export class StatsApiController {
  constructor(private readonly deps: StatsApiControllerDeps) {}

  registerRoutes(app: FastifyInstance): void {
    app.get("/api/stats/tasks/:taskId", async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      const filters = parseFilters(request);
      if (!filters) {
        reply.code(400).send({ error: "invalid stats filters" });
        return;
      }
      const saved = await this.deps.taskRepository.get(taskId);
      if (!saved) {
        reply.code(404).send({ error: "task not found" });
        return;
      }
      const hidden = await this.hiddenFromMember(request, { taskId });
      if (hidden) {
        reply.code(404).send({ error: "task not found" });
        return;
      }
      const rows = await queryAttemptStats(
        this.deps.queryable,
        await this.queryFor(request, filters, {
          taskId,
          task: saved,
          agentId: saved.assignee,
        }),
      );
      reply.send(buildTaskStats(taskId, filters, rows));
    });

    app.get("/api/stats/agents/:agentId", async (request, reply) => {
      const { agentId } = request.params as { agentId: string };
      const filters = parseFilters(request);
      if (!filters) {
        reply.code(400).send({ error: "invalid stats filters" });
        return;
      }
      const hidden = await this.hiddenFromMember(request, { agentId });
      if (hidden) {
        reply.code(404).send({ error: "agent not found" });
        return;
      }
      const rows = await queryAttemptStats(
        this.deps.queryable,
        await this.queryFor(request, filters, { agentId }),
      );
      const current =
        filters.scope === "current"
          ? await this.keepCurrentTaskRevisions(rows)
          : rows;
      reply.send(buildAgentStats(agentId, filters, current));
    });
  }

  private async queryFor(
    request: FastifyRequest,
    filters: StatsFilters,
    subject: { taskId?: string; agentId: string; task?: Task },
  ) {
    const operator = readOperatorContext(request.headers);
    const days = WINDOWS[filters.window];
    const since =
      days === null
        ? null
        : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    let taskRevisionHashValue: string | null = null;
    let personaVersion: number | null = null;
    if (filters.scope === "current") {
      if (subject.task) {
        taskRevisionHashValue = taskRevisionHash(subject.task);
      }
      personaVersion = await currentPersonaVersion(
        this.deps.queryable,
        subject.agentId,
      );
    }
    return {
      taskId: subject.taskId,
      agentId: subject.taskId ? undefined : subject.agentId,
      ownerId: operator?.role === "member" ? operator.ownerId : undefined,
      since,
      kind: filters.kind,
      taskRevisionHash: taskRevisionHashValue,
      personaVersion,
    };
  }

  private async keepCurrentTaskRevisions(
    rows: readonly AttemptStatsRow[],
  ): Promise<AttemptStatsRow[]> {
    const hashes = new Map<string, string | null>();
    for (const row of rows) {
      if (hashes.has(row.taskId)) {
        continue;
      }
      const saved = await this.deps.taskRepository.get(row.taskId);
      hashes.set(row.taskId, saved ? taskRevisionHash(saved) : null);
    }
    return rows.filter(
      (row) => hashes.get(row.taskId) === row.taskRevisionHash,
    );
  }

  /** A member who has no attempts, while someone else does, learns nothing. */
  private async hiddenFromMember(
    request: FastifyRequest,
    subject: { taskId?: string; agentId?: string },
  ): Promise<boolean> {
    const operator = readOperatorContext(request.headers);
    if (!operator || operator.role !== "member") {
      return false;
    }
    const owners = await attemptOwners(this.deps.queryable, subject);
    if (owners.length === 0) {
      return false;
    }
    return !owners.includes(operator.ownerId);
  }
}

function parseFilters(request: FastifyRequest): StatsFilters | null {
  const query = request.query as Record<string, string | undefined>;
  const window = query.window ?? "30d";
  const scope = query.scope ?? "current";
  const kind = query.kind ?? "initial";
  if (!(window in WINDOWS)) {
    return null;
  }
  if (scope !== "current" && scope !== "all") {
    return null;
  }
  if (kind !== "initial" && kind !== "follow_up" && kind !== "all") {
    return null;
  }
  return {
    window: window as StatsFilters["window"],
    scope,
    kind,
  };
}

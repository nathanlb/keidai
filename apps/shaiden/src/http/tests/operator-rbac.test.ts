import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import {
  operatorContextHeaders,
  type Logger,
  type RunListItem,
  type RunsResponse,
  type Task,
} from "@keidai/shared";
import {
  AgentDefinitionError,
  type AgentDefinition,
  type FudaClient,
} from "@keidai/shared/clients";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import type { LaunchedHarnessRun } from "../../run/types/harness.js";
import { ShaidenHttpServer } from "../shaiden-http-server.js";
import { createTestPersistence } from "../../testing/persistence.js";

process.env.BFF_SERVICE_TOKEN_DISABLED ??= "true";
process.env.SHAIDEN_SECRET_KEY ??= "shaiden-test-secret-key-do-not-use";

const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const runtimeConfig: RuntimeConfig = {
  toriiMcpUrl: "http://127.0.0.1:3100/mcp",
  getSubjectToken: () => "test-bearer",
  openRouterApiKey: "sk-or-env-fallback-key-value",
  modelId: "deepseek/deepseek-v4.1-flash",
  httpHost: "127.0.0.1",
  httpPort: 3200,
};

const owners: Record<string, string> = {
  "ada-agent": "ada",
  "bob-agent": "bob",
  "boss-agent": "boss",
};

function taskFor(assignee: string, goal = "Draft a note."): Task {
  return { goal, trigger: { type: "now" }, assignee };
}

function headers(
  ownerId: string,
  role: "admin" | "member",
  json = false,
): Record<string, string> {
  return {
    ...operatorContextHeaders({ ownerId, role }),
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

function fudaClient(): FudaClient {
  return {
    async exchangeToken() {
      throw new Error("unused");
    },
    async getAgentDefinition(agentId: string): Promise<AgentDefinition> {
      const ownerId = owners[agentId];
      if (!ownerId) {
        throw new AgentDefinitionError("agent_not_found", "missing agent");
      }
      return {
        name: agentId,
        slug: agentId,
        persona: "You are a test agent.",
        personaVersion: 1,
        ownerId,
      };
    },
  };
}

async function startServer() {
  const persistence = await createTestPersistence();
  const launched: string[] = [];
  const server = new ShaidenHttpServer({
    runStore: persistence.runStore,
    taskRepository: persistence.taskRepository,
    pool: persistence.pool,
    logger: silentLogger,
    runtimeConfig,
    fudaClient: fudaClient(),
    fetchOpenRouterModels: async () => ({
      data: [
        {
          id: "openai/gpt-4o",
          name: "GPT-4o",
          supported_parameters: ["tools"],
        },
      ],
    }),
    startTaskRun: async ({ task, taskId }): Promise<LaunchedHarnessRun> => {
      launched.push(task.assignee);
      const runId = `run-${launched.length}`;
      await persistence.runStore.createRun({
        id: runId,
        taskId,
        task,
        assignee: task.assignee,
        goal: task.goal,
        agentOwnerId: owners[task.assignee],
      });
      return {
        runId,
        done: Promise.resolve({
          run: {
            id: runId,
            task,
            startedAt: new Date().toISOString(),
            outcome: { status: "goal_met" },
          },
          discoveredTools: [],
          iterations: 1,
        }),
      };
    },
    resumeHarnessRun: async () => {
      throw new Error("unused");
    },
  });
  const handle = await server.start({ host: "127.0.0.1", port: 0 });
  return { persistence, handle, launched };
}

function readSseRunIds(
  url: string,
  requestHeaders: Record<string, string>,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: requestHeaders }, (response) => {
      let body = "";
      const timer = setTimeout(() => {
        req.destroy();
        resolve(
          [...body.matchAll(/"id":"(run-[^"]+)"/g)].map((match) => match[1]!),
        );
      }, 250);
      response.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      response.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    req.on("error", reject);
  });
}

describe("Shaiden operator RBAC", () => {
  it("lets members create and run only their own agents, and lets admins edit any task", async () => {
    const { persistence, handle } = await startServer();
    try {
      const denied = await fetch(`${handle.baseUrl}/api/tasks`, {
        method: "POST",
        headers: headers("ada", "member", true),
        body: JSON.stringify(taskFor("bob-agent")),
      });
      assert.equal(denied.status, 403);

      const created = await fetch(`${handle.baseUrl}/api/tasks`, {
        method: "POST",
        headers: headers("bob", "member", true),
        body: JSON.stringify(taskFor("bob-agent")),
      });
      assert.equal(created.status, 201);
      const bobTask = (await created.json()) as { task: { id: string } };

      const memberPatch = await fetch(
        `${handle.baseUrl}/api/tasks/${bobTask.task.id}`,
        {
          method: "PATCH",
          headers: headers("ada", "member", true),
          body: JSON.stringify({ goal: "Stolen goal." }),
        },
      );
      assert.equal(memberPatch.status, 403);

      const adminPatch = await fetch(
        `${handle.baseUrl}/api/tasks/${bobTask.task.id}`,
        {
          method: "PATCH",
          headers: headers("boss", "admin", true),
          body: JSON.stringify({ goal: "Admin edit." }),
        },
      );
      assert.equal(adminPatch.status, 200);

      const reassign = await fetch(
        `${handle.baseUrl}/api/tasks/${bobTask.task.id}`,
        {
          method: "PATCH",
          headers: headers("boss", "admin", true),
          body: JSON.stringify({ assignee: "ada-agent" }),
        },
      );
      assert.equal(reassign.status, 403);

      const memberRun = await fetch(
        `${handle.baseUrl}/api/tasks/${bobTask.task.id}/run`,
        { method: "POST", headers: headers("ada", "member") },
      );
      assert.equal(memberRun.status, 403);

      const adminRun = await fetch(
        `${handle.baseUrl}/api/tasks/${bobTask.task.id}/run`,
        { method: "POST", headers: headers("boss", "admin") },
      );
      assert.equal(adminRun.status, 403);

      const ownerRun = await fetch(
        `${handle.baseUrl}/api/tasks/${bobTask.task.id}/run`,
        { method: "POST", headers: headers("bob", "member") },
      );
      assert.equal(ownerRun.status, 202);

      const memberDelete = await fetch(
        `${handle.baseUrl}/api/tasks/${bobTask.task.id}`,
        { method: "DELETE", headers: headers("ada", "member") },
      );
      assert.equal(memberDelete.status, 403);

      const listed = await fetch(`${handle.baseUrl}/api/tasks`, {
        headers: headers("ada", "member"),
      });
      assert.equal(listed.status, 200);

      const adminDelete = await fetch(
        `${handle.baseUrl}/api/tasks/${bobTask.task.id}`,
        { method: "DELETE", headers: headers("boss", "admin") },
      );
      assert.equal(adminDelete.status, 204);
    } finally {
      await handle.close();
      await persistence.close();
    }
  });

  it("hides other operators' runs from members and keeps continuation owner-only", async () => {
    const { persistence, handle } = await startServer();
    try {
      const adaTask = await persistence.taskRepository.create({
        task: taskFor("ada-agent"),
      });
      const bobTask = await persistence.taskRepository.create({
        task: taskFor("bob-agent"),
      });
      await persistence.runStore.createRun({
        id: "run-ada",
        taskId: adaTask.id,
        task: taskFor("ada-agent"),
        assignee: "ada-agent",
        goal: "Ada goal",
        agentOwnerId: "ada",
      });
      await persistence.runStore.createRun({
        id: "run-bob",
        taskId: bobTask.id,
        task: taskFor("bob-agent"),
        assignee: "bob-agent",
        goal: "Bob goal",
        agentOwnerId: "bob",
      });

      const memberList = await fetch(`${handle.baseUrl}/api/runs`, {
        headers: headers("ada", "member"),
      });
      const memberBody = (await memberList.json()) as RunsResponse;
      assert.deepEqual(
        memberBody.runs.map((run: RunListItem) => run.id),
        ["run-ada"],
      );

      const hidden = await fetch(`${handle.baseUrl}/api/runs/run-bob`, {
        headers: headers("ada", "member"),
      });
      assert.equal(hidden.status, 404);

      const adminGet = await fetch(`${handle.baseUrl}/api/runs/run-bob`, {
        headers: headers("boss", "admin"),
      });
      assert.equal(adminGet.status, 200);

      const memberFollowUp = await fetch(
        `${handle.baseUrl}/api/runs/run-bob/follow-up`,
        {
          method: "POST",
          headers: headers("ada", "member", true),
          body: JSON.stringify({ message: "keep going" }),
        },
      );
      assert.equal(memberFollowUp.status, 403);

      const adminFollowUp = await fetch(
        `${handle.baseUrl}/api/runs/run-bob/follow-up`,
        {
          method: "POST",
          headers: headers("boss", "admin", true),
          body: JSON.stringify({ message: "keep going" }),
        },
      );
      assert.equal(adminFollowUp.status, 403);

      const adminResume = await fetch(
        `${handle.baseUrl}/api/runs/run-bob/resume`,
        { method: "POST", headers: headers("boss", "admin") },
      );
      assert.equal(adminResume.status, 403);

      const memberStop = await fetch(
        `${handle.baseUrl}/api/runs/run-bob/stop`,
        {
          method: "POST",
          headers: headers("ada", "member"),
        },
      );
      assert.equal(memberStop.status, 403);

      const adminStop = await fetch(`${handle.baseUrl}/api/runs/run-bob/stop`, {
        method: "POST",
        headers: headers("boss", "admin"),
      });
      assert.equal(adminStop.status, 202);

      const sseIds = await readSseRunIds(
        `${handle.baseUrl}/api/runs/events`,
        headers("ada", "member"),
      );
      assert.ok(sseIds.includes("run-ada"));
      assert.equal(sseIds.includes("run-bob"), false);
    } finally {
      await handle.close();
      await persistence.close();
    }
  });

  it("lets only admins manage the OpenRouter credential", async () => {
    const { persistence, handle } = await startServer();
    try {
      const memberGet = await fetch(
        `${handle.baseUrl}/api/openrouter/credential`,
        { headers: headers("ada", "member") },
      );
      assert.equal(memberGet.status, 403);

      const memberPut = await fetch(
        `${handle.baseUrl}/api/openrouter/credential`,
        {
          method: "PUT",
          headers: headers("ada", "member", true),
          body: JSON.stringify({ apiKey: "sk-or-v1-member-should-not-write" }),
        },
      );
      assert.equal(memberPut.status, 403);

      const memberDelete = await fetch(
        `${handle.baseUrl}/api/openrouter/credential`,
        { method: "DELETE", headers: headers("ada", "member") },
      );
      assert.equal(memberDelete.status, 403);

      const adminGet = await fetch(
        `${handle.baseUrl}/api/openrouter/credential`,
        { headers: headers("boss", "admin") },
      );
      assert.equal(adminGet.status, 200);

      const memberModels = await fetch(
        `${handle.baseUrl}/api/openrouter/models`,
        { headers: headers("ada", "member") },
      );
      assert.equal(memberModels.status, 200);
      const models = (await memberModels.json()) as { models: unknown[] };
      assert.equal(models.models.length, 1);
    } finally {
      await handle.close();
      await persistence.close();
    }
  });
});

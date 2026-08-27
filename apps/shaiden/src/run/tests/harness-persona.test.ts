import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Task } from "@keidai/shared";
import {
  AgentDefinitionError,
  type AgentDefinition,
  type ExchangedAgentToken,
  type FudaClient,
} from "@keidai/shared/clients";
import type { RuntimeConfig } from "../../config/runtime-config.js";
import { createTestPersistence } from "../../testing/persistence.js";
import { launchHarnessRun, resumeHarnessRun } from "../harness.js";
import { systemPromptFromPersona } from "../prompts.js";

const sampleTask: Task = {
  goal: "Draft the weekly status note.",
  trigger: { type: "now" },
  assignee: "shaiden-newsletter-01",
  limits: { max_iterations: 1, timeout_seconds: 30 },
};

const baseConfig: RuntimeConfig = {
  toriiMcpUrl: "http://127.0.0.1:9/mcp",
  getSubjectToken: () => "subject",
  fudaBaseUrl: "http://fuda.test",
  openRouterApiKey: "test-key",
  modelId: "test-model",
  httpHost: "127.0.0.1",
  httpPort: 3200,
};

function stubFuda(definition: AgentDefinition): FudaClient & {
  definitionCalls: number;
  requestedAgentIds: string[];
  currentDefinition: AgentDefinition;
} {
  const client = {
    definitionCalls: 0,
    requestedAgentIds: [] as string[],
    currentDefinition: definition,
    async getAgentDefinition(agentId: string): Promise<AgentDefinition> {
      client.definitionCalls += 1;
      client.requestedAgentIds.push(agentId);
      return client.currentDefinition;
    },
    async exchangeToken(): Promise<ExchangedAgentToken> {
      throw new Error("token exchange should not run in this test");
    },
  };
  return client;
}

/** Attach before any await — drive rejects as soon as token exchange runs. */
function expectTokenExchangeRejected(done: Promise<unknown>): Promise<void> {
  return assert.rejects(done, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /token exchange/i);
    return true;
  });
}

describe("launchHarnessRun persona fetch", () => {
  it("stamps persona version onto the run before driving", async () => {
    const persistence = await createTestPersistence();
    const taskId = (await persistence.taskRepository.create({ task: sampleTask })).id;
    const fuda = stubFuda({
      name: "Newsletter",
      slug: "newsletter",
      persona: "You are a concise newsletter author.",
      personaVersion: 4,
    });

    // Drive fails at token exchange (stub fudaClient is present); we only
    // care that the persona was stamped on the run before drive starts.
    const launched = await launchHarnessRun({
      task: sampleTask,
      taskId,
      config: baseConfig,
      runStore: persistence.runStore,
      options: { fudaClient: fuda },
    });
    const driveFailed = expectTokenExchangeRejected(launched.done);

    const saved = await persistence.runStore.getRun(launched.runId);
    assert.equal(fuda.definitionCalls, 1);
    assert.deepEqual(fuda.requestedAgentIds, [sampleTask.assignee]);
    assert.equal(saved?.personaVersion, 4);
    assert.equal(saved?.persona, "You are a concise newsletter author.");
    assert.equal(
      systemPromptFromPersona("You are a concise newsletter author.").includes(
        "You are a concise newsletter author.",
      ),
      true,
    );

    await driveFailed;
    await persistence.close();
  });

  it("fetches persona for task.assignee, not a process-global agent id", async () => {
    const persistence = await createTestPersistence();
    const otherTask: Task = {
      ...sampleTask,
      assignee: "other-agent-02",
    };
    const taskId = (await persistence.taskRepository.create({ task: otherTask })).id;
    const fuda = stubFuda({
      name: "Other",
      slug: "other",
      persona: "You are another agent.",
      personaVersion: 2,
    });

    const launched = await launchHarnessRun({
      task: otherTask,
      taskId,
      config: baseConfig,
      runStore: persistence.runStore,
      options: { fudaClient: fuda },
    });
    const driveFailed = expectTokenExchangeRejected(launched.done);

    assert.deepEqual(fuda.requestedAgentIds, ["other-agent-02"]);
    assert.equal(
      (await persistence.runStore.getRun(launched.runId))?.persona,
      "You are another agent.",
    );

    await driveFailed;
    await persistence.close();
  });

  it("rejects before creating a run when the agent is unknown", async () => {
    const persistence = await createTestPersistence();
    const taskId = (await persistence.taskRepository.create({ task: sampleTask })).id;
    const fuda: FudaClient = {
      async getAgentDefinition() {
        throw new AgentDefinitionError("agent_not_found", "Fuda agent not found", {
          status: 404,
        });
      },
      async exchangeToken() {
        throw new Error("unused");
      },
    };

    await assert.rejects(
      () =>
        launchHarnessRun({
          task: sampleTask,
          taskId,
          config: baseConfig,
          runStore: persistence.runStore,
          options: { fudaClient: fuda },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AgentDefinitionError);
        assert.equal(error.kind, "agent_not_found");
        return true;
      },
    );

    assert.equal((await persistence.runStore.listRuns()).runs.length, 0);
    await persistence.close();
  });

  it("rejects before creating a run when Fuda is unreachable", async () => {
    const persistence = await createTestPersistence();
    const taskId = (await persistence.taskRepository.create({ task: sampleTask })).id;
    const fuda: FudaClient = {
      async getAgentDefinition() {
        throw new AgentDefinitionError(
          "unreachable",
          "Fuda unreachable while fetching agent definition",
        );
      },
      async exchangeToken() {
        throw new Error("unused");
      },
    };

    await assert.rejects(
      () =>
        launchHarnessRun({
          task: sampleTask,
          taskId,
          config: baseConfig,
          runStore: persistence.runStore,
          options: { fudaClient: fuda },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AgentDefinitionError);
        assert.equal(error.kind, "unreachable");
        return true;
      },
    );

    assert.equal((await persistence.runStore.listRuns()).runs.length, 0);
    await persistence.close();
  });

  it("resume reuses the stamped persona even if Fuda returns a newer one", async () => {
    const persistence = await createTestPersistence();
    const taskId = (await persistence.taskRepository.create({ task: sampleTask })).id;
    const fuda = stubFuda({
      name: "Newsletter",
      slug: "newsletter",
      persona: "You are a concise newsletter author.",
      personaVersion: 4,
    });

    const launched = await launchHarnessRun({
      task: sampleTask,
      taskId,
      config: baseConfig,
      runStore: persistence.runStore,
      options: { fudaClient: fuda },
    });
    await assert.rejects(launched.done);
    assert.equal((await persistence.runStore.getRun(launched.runId))?.personaVersion, 4);

    fuda.currentDefinition = {
      name: "Newsletter",
      slug: "newsletter",
      persona: "You are a verbose newsletter author.",
      personaVersion: 5,
    };

    const history = [
      { role: "user" as const, text: "Task goal:\nDraft the weekly status note." },
      {
        role: "assistant" as const,
        text: "Done.",
        toolCalls: [],
      },
      { role: "user" as const, text: "Add a closing line." },
    ];
    const resumed = await resumeHarnessRun({
      runId: launched.runId,
      initialHistory: history,
      task: sampleTask,
      config: baseConfig,
      runStore: persistence.runStore,
      options: { fudaClient: fuda },
    });
    const resumeDone = assert.rejects(resumed.done);

    // Resume must not re-fetch; stamp on the run is still v4.
    assert.equal(fuda.definitionCalls, 1);
    assert.equal((await persistence.runStore.getRun(launched.runId))?.personaVersion, 4);
    assert.equal(
      (await persistence.runStore.getRun(launched.runId))?.persona,
      "You are a concise newsletter author.",
    );

    await resumeDone;
    await persistence.close();
  });

  it("resume fails when Fuda is configured but the run has no stamped persona", async () => {
    const persistence = await createTestPersistence();
    const taskId = (await persistence.taskRepository.create({ task: sampleTask })).id;
    await persistence.runStore.createRun({
      id: "legacy-run",
      taskId,
      task: sampleTask,
      assignee: sampleTask.assignee,
      goal: sampleTask.goal,
    });
    await persistence.runStore.setConversationHistory("legacy-run", [
      { role: "user", text: "hi" },
    ]);

    const fuda = stubFuda({
      name: "Newsletter",
      slug: "newsletter",
      persona: "You are a concise newsletter author.",
      personaVersion: 4,
    });

    await assert.rejects(
      () =>
        resumeHarnessRun({
          runId: "legacy-run",
          initialHistory: [{ role: "user", text: "hi" }],
          task: sampleTask,
          config: baseConfig,
          runStore: persistence.runStore,
          options: { fudaClient: fuda },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AgentDefinitionError);
        assert.equal(error.kind, "unexpected");
        assert.match(error.message, /no stamped persona/i);
        return true;
      },
    );
    assert.equal(fuda.definitionCalls, 0);
    await persistence.close();
  });
});

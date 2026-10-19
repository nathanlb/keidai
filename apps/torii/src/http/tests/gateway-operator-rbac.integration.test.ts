import "reflect-metadata";
import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import {
  OPERATOR_OWNER_HEADER,
  OPERATOR_ROLE_HEADER,
  PolicyDecision,
  type GroupResponse,
  type TraceListItem,
  type TraceStatsResponse,
  type TracesResponse,
} from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-agent-principal.js";
import { GroupPolicyCache } from "../../policy/group-policy-cache.service.js";
import { createApprovalServices } from "../../policy/tests/test-helpers.js";
import { TraceEmitterService } from "../../trace/trace-emitter.service.js";
import {
  finalizeCallTrace,
  toTracePrincipal,
} from "../../trace/utils/build-call-trace.js";
import {
  createStubToolCatalog,
  createTestGatewayHttpServer,
  createTestGatewayPersistence,
} from "./test-helpers.js";

const gmailServer = {
  name: "gmail",
  transport: { type: "http" as const, url: "http://127.0.0.1:9/mcp" },
  credential: { strategy: "none" as const },
};

function operatorHeaders(
  ownerId: string,
  role: "admin" | "member",
  json = false,
) {
  return {
    [OPERATOR_OWNER_HEADER]: ownerId,
    [OPERATOR_ROLE_HEADER]: role,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

describe("Torii operator RBAC", () => {
  it("lets a member edit only their own custom groups", async () => {
    const persistence = await createTestGatewayPersistence();
    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [gmailServer],
    });
    const server = await createTestGatewayHttpServer(
      createStubToolCatalog(),
      {} as never,
      {
        persistence,
        configService,
        groupPolicyCache: new GroupPolicyCache([]),
      },
    );
    const gateway = await server.start();
    try {
      const created = await fetch(`${gateway.baseUrl}/api/groups`, {
        method: "POST",
        headers: operatorHeaders("ada", "member", true),
        body: JSON.stringify({
          name: "ada-editors",
          description: "Ada",
          servers: [],
        }),
      });
      assert.equal(created.status, 201);
      const adaGroup = (await created.json()) as GroupResponse;
      assert.equal(adaGroup.group.ownerId, "ada");

      const system = await fetch(`${gateway.baseUrl}/api/groups`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "platform",
          description: "System",
          servers: [],
        }),
      });
      assert.equal(system.status, 201);
      const systemGroup = (await system.json()) as GroupResponse;
      assert.equal(systemGroup.group.ownerId, null);

      const memberPatchSystem = await fetch(
        `${gateway.baseUrl}/api/groups/${systemGroup.group.id}`,
        {
          method: "PATCH",
          headers: operatorHeaders("ada", "member", true),
          body: JSON.stringify({ description: "stolen" }),
        },
      );
      assert.equal(memberPatchSystem.status, 403);

      const ownPatch = await fetch(
        `${gateway.baseUrl}/api/groups/${adaGroup.group.id}`,
        {
          method: "PATCH",
          headers: operatorHeaders("ada", "member", true),
          body: JSON.stringify({ description: "updated" }),
        },
      );
      assert.equal(ownPatch.status, 200);

      const adminPatch = await fetch(
        `${gateway.baseUrl}/api/groups/${systemGroup.group.id}`,
        {
          method: "PATCH",
          headers: operatorHeaders("boss", "admin", true),
          body: JSON.stringify({ description: "admin edit" }),
        },
      );
      assert.equal(adminPatch.status, 200);

      const memberDelete = await fetch(
        `${gateway.baseUrl}/api/groups/${systemGroup.group.id}`,
        {
          method: "DELETE",
          headers: operatorHeaders("bob", "member"),
        },
      );
      assert.equal(memberDelete.status, 403);
    } finally {
      await gateway.close();
      await persistence.close();
    }
  });

  it("keeps approval execution owner-only and lets admins reject", async () => {
    const persistence = await createTestGatewayPersistence();
    const approvalServices = await createApprovalServices([], persistence);
    const server = await createTestGatewayHttpServer(
      createStubToolCatalog(),
      {} as never,
      { persistence, approvalServices },
    );
    const adaApproval =
      await approvalServices.approvalStore.createPendingApproval({
        principal: {
          ...TEST_AGENT_PRINCIPAL,
          agentId: "ada-agent",
          ownerId: "ada",
        },
        toolName: "gmail.create_draft",
        params: { n: 1 },
        paramsHash: "ada-approve",
      });
    const bobApproval =
      await approvalServices.approvalStore.createPendingApproval({
        principal: {
          ...TEST_AGENT_PRINCIPAL,
          agentId: "bob-agent",
          ownerId: "bob",
        },
        toolName: "gmail.create_draft",
        params: { n: 2 },
        paramsHash: "bob-reject",
      });
    const gateway = await server.start();
    try {
      const memberList = await fetch(`${gateway.baseUrl}/api/approvals`, {
        headers: operatorHeaders("ada", "member"),
      });
      assert.equal(memberList.status, 200);
      const memberBody = (await memberList.json()) as Array<{ id: string }>;
      assert.deepEqual(
        memberBody.map((approval) => approval.id),
        [adaApproval.id],
      );

      const hidden = await fetch(
        `${gateway.baseUrl}/api/approvals/${bobApproval.id}`,
        { headers: operatorHeaders("ada", "member") },
      );
      assert.equal(hidden.status, 404);

      const adminApprove = await fetch(
        `${gateway.baseUrl}/api/approvals/${adaApproval.id}/approve`,
        {
          method: "POST",
          headers: operatorHeaders("boss", "admin"),
        },
      );
      assert.equal(adminApprove.status, 403);
      assert.deepEqual(await adminApprove.json(), {
        error: "only the owning operator can approve tool execution",
      });

      const ownerApprove = await fetch(
        `${gateway.baseUrl}/api/approvals/${adaApproval.id}/approve`,
        {
          method: "POST",
          headers: operatorHeaders("ada", "member"),
        },
      );
      assert.equal(ownerApprove.status, 200);

      const memberReject = await fetch(
        `${gateway.baseUrl}/api/approvals/${bobApproval.id}/reject`,
        {
          method: "POST",
          headers: operatorHeaders("ada", "member", true),
          body: JSON.stringify({ reason: "no" }),
        },
      );
      assert.equal(memberReject.status, 403);

      const adminReject = await fetch(
        `${gateway.baseUrl}/api/approvals/${bobApproval.id}/reject`,
        {
          method: "POST",
          headers: operatorHeaders("boss", "admin", true),
          body: JSON.stringify({ reason: "stop" }),
        },
      );
      assert.equal(adminReject.status, 200);
    } finally {
      await gateway.close();
      await persistence.close();
    }
  });

  it("hides other operators' traces from members", async () => {
    const persistence = await createTestGatewayPersistence();
    const traceEmitter = new TraceEmitterService(persistence.traceRepository);
    const server = await createTestGatewayHttpServer(
      createStubToolCatalog(),
      {} as never,
      { persistence, traceEmitter },
    );

    const adaTrace = finalizeCallTrace(
      {
        server: "github",
        tool: "search_issues",
        principal: toTracePrincipal({
          ...TEST_AGENT_PRINCIPAL,
          ownerId: "ada",
        }),
        policyDecision: PolicyDecision.Denied,
        error: "policy denied",
      },
      { traceId: "ada-trace", timestamp: new Date().toISOString() },
    );
    const bobTrace = finalizeCallTrace(
      {
        server: "github",
        tool: "search_issues",
        principal: toTracePrincipal({
          ...TEST_AGENT_PRINCIPAL,
          ownerId: "bob",
        }),
        policyDecision: PolicyDecision.Denied,
        error: "policy denied",
      },
      { traceId: "bob-trace", timestamp: new Date().toISOString() },
    );
    await traceEmitter.emit(adaTrace);
    await traceEmitter.emit(bobTrace);

    const gateway = await server.start();
    try {
      const memberList = await fetch(`${gateway.baseUrl}/api/traces`, {
        headers: operatorHeaders("ada", "member"),
      });
      const memberBody = (await memberList.json()) as TracesResponse;
      assert.deepEqual(
        memberBody.traces.map((trace) => trace.traceId),
        ["ada-trace"],
      );

      const hidden = await fetch(`${gateway.baseUrl}/api/traces/bob-trace`, {
        headers: operatorHeaders("ada", "member"),
      });
      assert.equal(hidden.status, 404);

      const memberStats = await fetch(`${gateway.baseUrl}/api/traces/stats`, {
        headers: operatorHeaders("ada", "member"),
      });
      const stats = (await memberStats.json()) as TraceStatsResponse;
      assert.equal(stats.deniedCount, 1);

      const adminList = await fetch(`${gateway.baseUrl}/api/traces`, {
        headers: operatorHeaders("boss", "admin"),
      });
      const adminBody = (await adminList.json()) as TracesResponse;
      assert.equal(adminBody.traces.length, 2);

      const events = await readTraceEvents(
        `${gateway.baseUrl}/api/traces/events`,
        operatorHeaders("ada", "member"),
        (seen) => seen.some((event) => event.trace.traceId === "ada-live"),
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          await traceEmitter.emit(
            finalizeCallTrace(
              {
                server: "github",
                tool: "search_issues",
                principal: toTracePrincipal({
                  ...TEST_AGENT_PRINCIPAL,
                  ownerId: "bob",
                }),
                policyDecision: PolicyDecision.Allowed,
                durationMs: 1,
              },
              {
                traceId: "bob-live",
                timestamp: new Date().toISOString(),
              },
            ),
          );
          await traceEmitter.emit(
            finalizeCallTrace(
              {
                server: "github",
                tool: "search_issues",
                principal: toTracePrincipal({
                  ...TEST_AGENT_PRINCIPAL,
                  ownerId: "ada",
                }),
                policyDecision: PolicyDecision.Allowed,
                durationMs: 1,
              },
              {
                traceId: "ada-live",
                timestamp: new Date().toISOString(),
              },
            ),
          );
        },
      );
      const ids = events.map((event) => event.trace.traceId);
      assert.ok(ids.includes("ada-trace"));
      assert.ok(ids.includes("ada-live"));
      assert.equal(ids.includes("bob-trace"), false);
      assert.equal(ids.includes("bob-live"), false);
    } finally {
      await gateway.close();
      await persistence.close();
    }
  });
});

function readTraceEvents(
  url: string,
  headers: Record<string, string>,
  predicate: (events: Array<{ trace: TraceListItem }>) => boolean,
  afterOpen: () => Promise<void>,
): Promise<Array<{ trace: TraceListItem }>> {
  return new Promise((resolve, reject) => {
    const parsed: Array<{ trace: TraceListItem }> = [];
    let buffer = "";
    const req = http.get(url, { headers }, (res) => {
      assert.equal(res.statusCode, 200);
      void afterOpen().catch(reject);
      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const dataLine = part
            .split("\n")
            .find((line) => line.startsWith("data: "));
          if (!dataLine) {
            continue;
          }
          parsed.push({
            trace: JSON.parse(dataLine.slice("data: ".length)) as TraceListItem,
          });
        }
        if (predicate(parsed)) {
          req.destroy();
          resolve(parsed);
        }
      });
    });
    req.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ECONNRESET") {
        resolve(parsed);
        return;
      }
      reject(error);
    });
    setTimeout(() => {
      req.destroy();
      reject(new Error("timed out waiting for trace events"));
    }, 5_000);
  });
}

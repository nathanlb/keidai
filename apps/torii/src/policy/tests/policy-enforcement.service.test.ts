import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { TEST_AGENT_PRINCIPAL } from "../../identity/tests/test-agent-principal.js";
import { createCapturingLogger } from "../../logging/tests/test-helpers.js";
import { PolicyEnforcementService } from "../policy-enforcement.service.js";

describe("PolicyEnforcementService", () => {
  it("warns when policy references tools absent from the backend catalog", () => {
    const config: ToriiConfig = {
      boot_owner_id: "test-owner",
      oauth_providers: {},
      agents: [],
      servers: [
        {
          name: "github",
          transport: { type: "http", url: "http://localhost:0" },
          credential: { strategy: "none" },
        },
      ],
      groups: [
        {
          name: "agents",
          description: "Test agents group",
          permissions: [
            {
              server: "github",
              tools: ["stale_tool", "removed_tool"],
            },
          ],
        },
      ],
    };
    const logger = createCapturingLogger();
    const service = new PolicyEnforcementService(
      new ToriiConfigService(config),
      logger,
    );

    service.warnUnknownPolicyTools("github", [
      "search_issues",
      "get_file_contents",
    ]);

    assert.equal(logger.logs.length, 2);
    assert.ok(
      logger.logs.some(
        (entry) =>
          entry.event === "policy.unknown_tool" && entry.fields.tool === "stale_tool",
      ),
    );
    assert.ok(
      logger.logs.some(
        (entry) =>
          entry.event === "policy.unknown_tool" &&
          entry.fields.tool === "removed_tool",
      ),
    );
  });

  it("logs and denies when the principal carries an unknown group", () => {
    const config: ToriiConfig = {
      boot_owner_id: "test-owner",
      oauth_providers: {},
      agents: [],
      servers: [
        {
          name: "github",
          transport: { type: "http", url: "http://localhost:0" },
          credential: { strategy: "none" },
        },
      ],
      groups: [
        {
          name: "agents",
          description: "Test agents group",
          permissions: [{ server: "github", tools: ["search_issues"] }],
        },
      ],
    };
    const logger = createCapturingLogger();
    const service = new PolicyEnforcementService(
      new ToriiConfigService(config),
      logger,
    );

    const evaluation = service.evaluate(
      { ...TEST_AGENT_PRINCIPAL, groups: ["ops"] },
      "github",
      "search_issues",
    );

    assert.equal(evaluation.decision, "denied");
    assert.equal(evaluation.reason, "unknown_group: ops");
    assert.ok(
      logger.logs.some(
        (entry) =>
          entry.event === "policy.unknown_group" && entry.fields.group === "ops",
      ),
    );
  });
});

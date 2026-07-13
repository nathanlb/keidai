import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { createCapturingLogger } from "../../logging/tests/test-helpers.js";
import { PolicyEnforcementService } from "../policy-enforcement.service.js";

describe("PolicyEnforcementService", () => {
  it("warns when policy references tools absent from the backend catalog", () => {
    const config: ToriiConfig = {
      oauth_providers: {},
      agents: [],
      servers: [
        {
          name: "github",
          transport: { type: "http", url: "http://localhost:0" },
          credential: { strategy: "none" },
          policy: {
            default: "deny",
            allow: ["search_issues", "stale_tool"],
            deny: ["removed_tool"],
          },
        },
      ],
    };
    const logger = createCapturingLogger();
    const service = new PolicyEnforcementService(
      new ToriiConfigService(config),
      logger,
    );

    service.warnUnknownPolicyTools(config.servers[0]!, [
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
});

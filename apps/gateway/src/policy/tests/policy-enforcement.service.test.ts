import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
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
    const service = new PolicyEnforcementService(new ToriiConfigService(config));
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };

    try {
      service.warnUnknownPolicyTools(config.servers[0]!, [
        "search_issues",
        "get_file_contents",
      ]);

      assert.equal(warnings.length, 2);
      assert.ok(
        warnings.some((message) => message.includes('unknown tool "stale_tool"')),
      );
      assert.ok(
        warnings.some((message) => message.includes('unknown tool "removed_tool"')),
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});

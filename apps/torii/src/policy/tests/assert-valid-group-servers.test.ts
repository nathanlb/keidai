import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GroupServerPolicy } from "../types/group-policy.js";
import { GroupPolicyWriteError } from "../types/group-policy-write.js";
import { assertValidGroupServers } from "../utils/assert-valid-group-servers.js";

function policy(
  overrides: Partial<GroupServerPolicy> & Pick<GroupServerPolicy, "server">,
): GroupServerPolicy {
  return {
    default: "deny",
    allow: [],
    deny: [],
    gated: [],
    ...overrides,
  };
}

describe("assertValidGroupServers", () => {
  const known = new Set(["gmail", "github"]);

  it("accepts allow and gated listing the same tool", () => {
    assert.doesNotThrow(() =>
      assertValidGroupServers(
        [
          policy({
            server: "gmail",
            allow: ["create_draft", "list_drafts"],
            gated: ["create_draft"],
          }),
        ],
        known,
      ),
    );
  });

  it("rejects unknown servers", () => {
    assert.throws(
      () =>
        assertValidGroupServers(
          [policy({ server: "missing", allow: ["search"] })],
          known,
        ),
      (error: unknown) => {
        assert.ok(error instanceof GroupPolicyWriteError);
        assert.match(error.message, /unknown server "missing"/);
        return true;
      },
    );
  });

  it("rejects a tool in both allow and deny", () => {
    assert.throws(
      () =>
        assertValidGroupServers(
          [
            policy({
              server: "gmail",
              allow: ["create_draft"],
              deny: ["create_draft"],
            }),
          ],
          known,
        ),
      /allow and deny/,
    );
  });

  it("rejects a tool in both deny and gated", () => {
    assert.throws(
      () =>
        assertValidGroupServers(
          [
            policy({
              server: "gmail",
              deny: ["create_draft"],
              gated: ["create_draft"],
            }),
          ],
          known,
        ),
      /deny and gated/,
    );
  });

  it("rejects duplicate server entries and duplicate tools in a list", () => {
    assert.throws(
      () =>
        assertValidGroupServers(
          [
            policy({ server: "gmail", allow: ["a", "a"] }),
            policy({ server: "gmail", allow: ["b"] }),
          ],
          known,
        ),
      (error: unknown) => {
        assert.ok(error instanceof GroupPolicyWriteError);
        assert.match(error.message, /duplicate server "gmail"/);
        assert.match(error.message, /duplicate tool "a" in allow/);
        return true;
      },
    );
  });
});

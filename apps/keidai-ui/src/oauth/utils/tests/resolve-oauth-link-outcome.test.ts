import { describe, expect, it } from "vitest";
import {
  connectionStatusForProvider,
  resolveOAuthLinkOutcome,
  shouldAcceptLinkedOutcome,
} from "../resolve-oauth-link-outcome.js";

describe("resolveOAuthLinkOutcome", () => {
  it("returns pending when the provider has no connection row", () => {
    expect(
      resolveOAuthLinkOutcome(
        [{ provider: "github", ownerId: "a", status: "linked", scopes: [] }],
        "sentry",
      ),
    ).toEqual({ kind: "pending" });
  });

  it("returns linked when the provider grant is active", () => {
    expect(
      resolveOAuthLinkOutcome(
        [{ provider: "github", ownerId: "a", status: "linked", scopes: [] }],
        "github",
      ),
    ).toEqual({ kind: "linked" });
  });

  it("returns failed with the gateway error message", () => {
    expect(
      resolveOAuthLinkOutcome(
        [
          {
            provider: "github",
            ownerId: "a",
            status: "failed",
            scopes: [],
            error: "access_denied",
          },
        ],
        "github",
      ),
    ).toEqual({ kind: "failed", error: "access_denied" });
  });
});

describe("shouldAcceptLinkedOutcome", () => {
  it("accepts linked when the flow started from not_linked", () => {
    expect(
      shouldAcceptLinkedOutcome(
        { kind: "linked" },
        { statusAtStart: "not_linked", sawPending: false },
      ),
    ).toBe(true);
  });

  it("rejects stale linked grants during a re-link before pending is observed", () => {
    expect(
      shouldAcceptLinkedOutcome(
        { kind: "linked" },
        { statusAtStart: "linked", sawPending: false },
      ),
    ).toBe(false);
  });

  it("accepts linked during re-link after pending was observed", () => {
    expect(
      shouldAcceptLinkedOutcome(
        { kind: "linked" },
        { statusAtStart: "linked", sawPending: true },
      ),
    ).toBe(true);
  });
});

describe("connectionStatusForProvider", () => {
  it("defaults to not_linked when the provider row is missing", () => {
    expect(connectionStatusForProvider([], "github")).toBe("not_linked");
  });
});

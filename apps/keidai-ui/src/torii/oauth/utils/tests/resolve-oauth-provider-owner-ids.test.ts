import { describe, expect, it } from "vitest";
import { resolveOAuthProviderOwnerIds } from "../resolve-oauth-provider-owner-ids.js";
import { buildOAuthProviderSummaries } from "../build-oauth-provider-summaries.js";

describe("resolveOAuthProviderOwnerIds", () => {
  it("includes the acting owner when there are no agents yet", () => {
    expect(resolveOAuthProviderOwnerIds("nathan-lafranceb", [])).toEqual([
      "nathan-lafranceb",
    ]);
  });

  it("unions acting owner with agent owners without duplicates", () => {
    expect(
      resolveOAuthProviderOwnerIds("nathan-lafranceb", [
        "team-a",
        "nathan-lafranceb",
      ]),
    ).toEqual(["nathan-lafranceb", "team-a"]);
  });

  it("returns only agent owners when there is no acting owner", () => {
    expect(resolveOAuthProviderOwnerIds(undefined, ["team-a"])).toEqual([
      "team-a",
    ]);
  });
});

describe("OAuth provider summaries with acting-only owners", () => {
  it("shows linked when the acting owner has a grant and no agents exist", () => {
    const ownerIds = resolveOAuthProviderOwnerIds("nathan-lafranceb", []);
    const summaries = buildOAuthProviderSummaries(
      {
        github: {
          token_url: "https://github.com/login/oauth/access_token",
          authorize_url: "https://github.com/login/oauth/authorize",
          client_id: "Iv1.public",
          scopes: ["repo"],
        },
      },
      ownerIds,
      new Map([
        [
          "nathan-lafranceb",
          [
            {
              provider: "github",
              ownerId: "nathan-lafranceb",
              status: "linked",
              scopes: ["repo"],
            },
          ],
        ],
      ]),
    );

    expect(summaries[0]?.aggregateStatus).toBe("linked");
    expect(summaries[0]?.owners).toEqual([
      expect.objectContaining({
        ownerId: "nathan-lafranceb",
        status: "linked",
      }),
    ]);
  });

  it("stays not_linked when ownerIds omit the acting owner that holds the grant", () => {
    // Repro of the empty-agents providers page bug: grants exist but are never queried.
    const summaries = buildOAuthProviderSummaries(
      {
        github: {
          token_url: "https://github.com/login/oauth/access_token",
          authorize_url: "https://github.com/login/oauth/authorize",
          client_id: "Iv1.public",
          scopes: ["repo"],
        },
      },
      [],
      new Map([
        [
          "nathan-lafranceb",
          [
            {
              provider: "github",
              ownerId: "nathan-lafranceb",
              status: "linked",
              scopes: ["repo"],
            },
          ],
        ],
      ]),
    );

    expect(summaries[0]?.aggregateStatus).toBe("not_linked");
  });
});

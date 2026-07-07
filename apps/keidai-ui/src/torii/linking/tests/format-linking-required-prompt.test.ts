import { describe, expect, it } from "vitest";
import {
  formatLinkingRequiredBannerBody,
  formatLinkProviderButtonLabel,
  isLinkingStillRequired,
  isOAuthProviderLinked,
} from "../format-linking-required-prompt.js";
import { linkingRequiredTrace } from "../../activity/utils/tests/trace-detail-fixtures.js";
import { githubServer } from "../../activity/utils/tests/trace-detail-fixtures.js";

describe("formatLinkingRequiredBannerBody", () => {
  it("includes tool, owner, and gateway response", () => {
    expect(formatLinkingRequiredBannerBody(linkingRequiredTrace)).toBe(
      'search_issues for owner nathanlb returned linking_required: OAuth connection required for provider "github" (backend "github")',
    );
  });
});

describe("formatLinkProviderButtonLabel", () => {
  it("uses the provider display label", () => {
    expect(formatLinkProviderButtonLabel("github")).toBe("Link GitHub");
  });
});

describe("isOAuthProviderLinked", () => {
  it("returns true when the provider is linked", () => {
    expect(
      isOAuthProviderLinked(
        [
          {
            provider: "github",
            ownerId: "nathanlb",
            status: "linked",
            scopes: ["repo"],
          },
        ],
        "github",
      ),
    ).toBe(true);
  });
});

describe("isLinkingStillRequired", () => {
  it("returns false once the provider is linked", () => {
    expect(
      isLinkingStillRequired(
        linkingRequiredTrace,
        githubServer,
        [
          {
            provider: "github",
            ownerId: "nathanlb",
            status: "linked",
            scopes: ["repo"],
          },
        ],
        new Set(),
      ),
    ).toBe(false);
  });

  it("returns false when the link was resolved in-session", () => {
    expect(
      isLinkingStillRequired(
        linkingRequiredTrace,
        githubServer,
        [],
        new Set(["nathanlb:github"]),
      ),
    ).toBe(false);
  });
});

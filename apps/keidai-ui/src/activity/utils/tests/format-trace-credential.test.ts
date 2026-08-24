import { describe, expect, it } from "vitest";
import {
  formatCredentialProvider,
  formatCredentialRef,
  formatCredentialStrategy,
  formatLinkingReason,
  resolveLinkProviderId,
} from "../format-trace-credential.js";
import {
  githubServer,
  linkingRequiredTrace,
  stripeServer,
  successTrace,
} from "./trace-detail-fixtures.js";

describe("formatCredentialStrategy", () => {
  it("maps server credential strategies to display labels", () => {
    expect(formatCredentialStrategy(githubServer)).toBe("user_oauth");
    expect(formatCredentialStrategy(stripeServer)).toBe("service_key");
    expect(formatCredentialStrategy(undefined)).toBe("—");
  });
});

describe("formatCredentialProvider", () => {
  it("returns the oauth provider id for user_oauth servers", () => {
    expect(formatCredentialProvider(githubServer)).toBe("github");
    expect(formatCredentialProvider(stripeServer)).toBe("—");
  });
});

describe("formatCredentialRef", () => {
  it("falls back when no credential was resolved", () => {
    expect(formatCredentialRef(successTrace)).toBe("github:nathanlb");
    expect(
      formatCredentialRef({ ...successTrace, credentialRef: undefined }),
    ).toBe("— none resolved");
  });
});

describe("resolveLinkProviderId", () => {
  it("prefers the server oauth provider", () => {
    expect(resolveLinkProviderId(linkingRequiredTrace, githubServer)).toBe(
      "github",
    );
  });

  it("parses the provider from linking_required error text", () => {
    expect(resolveLinkProviderId(linkingRequiredTrace)).toBe("github");
  });
});

describe("formatLinkingReason", () => {
  it("returns null for non-linking traces", () => {
    expect(formatLinkingReason(successTrace, githubServer)).toBeNull();
  });

  it("builds operator-facing copy for linking_required traces", () => {
    expect(formatLinkingReason(linkingRequiredTrace, githubServer)).toBe(
      "No grant stored for (nathanlb, github). The owner must link GitHub before this tool resolves.",
    );
  });
});

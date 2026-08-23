import { describe, expect, it } from "vitest";
import {
  buildConfigureHref,
  parseConfigureDeepLink,
  sanitizeReturnTo,
  titleCaseIdentifier,
} from "../configure-deep-link.js";

describe("sanitizeReturnTo", () => {
  it("accepts in-app workspace paths including query strings", () => {
    expect(sanitizeReturnTo("/runs/4821")).toBe("/runs/4821");
    expect(sanitizeReturnTo("/runs?run=abc")).toBe("/runs?run=abc");
  });

  it("rejects missing, external, and configure-loop targets", () => {
    expect(sanitizeReturnTo(null)).toBeUndefined();
    expect(sanitizeReturnTo("https://evil.example/phish")).toBeUndefined();
    expect(sanitizeReturnTo("//evil.example")).toBeUndefined();
    expect(sanitizeReturnTo("/configure/connections")).toBeUndefined();
    expect(sanitizeReturnTo("runs/4821")).toBeUndefined();
  });
});

describe("parseConfigureDeepLink", () => {
  it("reads return and fix from the search string", () => {
    expect(
      parseConfigureDeepLink(
        new URLSearchParams("return=/runs/4821&fix=slack"),
      ),
    ).toEqual({ returnTo: "/runs/4821", fix: "slack" });
  });

  it("drops an unsafe return and keeps a valid fix", () => {
    expect(
      parseConfigureDeepLink(
        new URLSearchParams("return=https://evil.example&fix=slack"),
      ),
    ).toEqual({ returnTo: undefined, fix: "slack" });
  });
});

describe("buildConfigureHref", () => {
  it("encodes a return target and optional fix onto the configure door", () => {
    expect(
      buildConfigureHref({ returnTo: "/runs/4821", fix: "slack" }),
    ).toBe("/configure/connections?return=%2Fruns%2F4821&fix=slack");
  });

  it("omits an unsafe return rather than encoding it", () => {
    expect(buildConfigureHref({ returnTo: "//evil.example" })).toBe(
      "/configure/connections",
    );
  });
});

describe("titleCaseIdentifier", () => {
  it("pretty-prints a connection or provider key", () => {
    expect(titleCaseIdentifier("slack")).toBe("Slack");
    expect(titleCaseIdentifier("oauth-google")).toBe("Oauth Google");
  });
});

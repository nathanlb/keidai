import { describe, expect, it } from "vitest";
import {
  formatAgentPrincipalLabel,
  resolveAgentSlug,
} from "../format-agent-principal.js";
import { filterTraces } from "../filter-traces.js";
import { deniedTrace } from "./trace-detail-fixtures.js";

describe("formatAgentPrincipal", () => {
  it("resolves slug from opaque id and falls back to id", () => {
    const slugById = new Map([["shaiden-newsletter-01", "shaiden-newsletter"]]);

    expect(resolveAgentSlug("shaiden-newsletter-01", slugById)).toBe(
      "shaiden-newsletter",
    );
    expect(resolveAgentSlug("unknown-agent", slugById)).toBeUndefined();
    expect(formatAgentPrincipalLabel("shaiden-newsletter-01", slugById)).toBe(
      "shaiden-newsletter",
    );
    expect(formatAgentPrincipalLabel("unknown-agent", slugById)).toBe(
      "unknown-agent",
    );
  });
});

describe("filterTraces agent slug", () => {
  it("matches query against resolved agent slug", () => {
    const slugById = new Map([["demo-agent", "newsletter-writer"]]);
    const matched = filterTraces(
      [deniedTrace],
      { query: "newsletter-writer", server: "all", outcome: "all" },
      slugById,
    );
    expect(matched).toHaveLength(1);

    const missed = filterTraces(
      [deniedTrace],
      { query: "newsletter-writer", server: "all", outcome: "all" },
      new Map(),
    );
    expect(missed).toHaveLength(0);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { namespaceTool, parseNamespacedTool } from "../namespacing.js";

describe("namespacing", () => {
  it("builds server-qualified tool names", () => {
    assert.equal(
      namespaceTool("github", "search_issues"),
      "github.search_issues",
    );
  });

  it("parses namespaced tool names", () => {
    assert.deepEqual(parseNamespacedTool("stripe.list_customers"), {
      server: "stripe",
      bareName: "list_customers",
    });
  });

  it("returns null for bare tool names", () => {
    assert.equal(parseNamespacedTool("search_issues"), null);
  });
});

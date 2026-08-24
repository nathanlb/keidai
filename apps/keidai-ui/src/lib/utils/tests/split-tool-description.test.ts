import { describe, expect, it } from "vitest";
import { splitToolDescription } from "../split-tool-description.js";

describe("splitToolDescription", () => {
  it("leaves short copy intact", () => {
    expect(splitToolDescription("Send a message")).toEqual({
      preview: "Send a message",
      expandable: false,
    });
  });

  it("keeps the first two lines and marks the rest as expandable", () => {
    expect(
      splitToolDescription("Send a message.\n\nRequires a linked Gmail account."),
    ).toEqual({
      preview: "Send a message.",
      expandable: true,
    });
  });

  it("caps a long single paragraph at a word boundary", () => {
    const description =
      "Search issues across repositories using GitHub's advanced query syntax including author, label, milestone, and date filters plus sorting options that make the first sentence already too long for a rule row.";
    const split = splitToolDescription(description);
    expect(split.expandable).toBe(true);
    expect(split.preview.length).toBeLessThan(description.length);
    expect(split.preview).not.toMatch(/\s$/);
    expect(description.startsWith(split.preview)).toBe(true);
  });
});

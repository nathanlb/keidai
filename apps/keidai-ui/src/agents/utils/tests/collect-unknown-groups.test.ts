import { describe, expect, it } from "vitest";
import {
  collectUnknownGroups,
  isKnownGroup,
} from "../collect-unknown-groups.js";

describe("collectUnknownGroups", () => {
  it("returns groups not present in the known set", () => {
    expect(
      collectUnknownGroups(["eng-platform", "mystery-group"], [
        "eng-platform",
        "triage",
      ]),
    ).toEqual(["mystery-group"]);
  });

  it("returns every group when the known set is empty", () => {
    expect(collectUnknownGroups(["eng-platform"], [])).toEqual([
      "eng-platform",
    ]);
  });

  it("returns an empty array when every group is known", () => {
    expect(collectUnknownGroups(["triage"], ["triage"])).toEqual([]);
  });
});

describe("isKnownGroup", () => {
  it("reports membership in the known set", () => {
    expect(isKnownGroup("triage", ["triage", "eng-platform"])).toBe(true);
    expect(isKnownGroup("mystery-group", ["triage"])).toBe(false);
  });
});

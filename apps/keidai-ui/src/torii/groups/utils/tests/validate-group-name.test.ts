import { describe, expect, it } from "vitest";
import { validateGroupName } from "../validate-group-name.js";

describe("validateGroupName", () => {
  it("accepts lowercase identifiers", () => {
    expect(validateGroupName("ops-write")).toBeNull();
    expect(validateGroupName("read-only")).toBeNull();
    expect(validateGroupName("analytics")).toBeNull();
  });

  it("rejects empty, reserved, and uppercase names", () => {
    expect(validateGroupName("")).toBe("Name is required.");
    expect(validateGroupName("new")).toMatch(/reserved/);
    expect(validateGroupName("Ops")).toMatch(/lowercase/);
  });
});

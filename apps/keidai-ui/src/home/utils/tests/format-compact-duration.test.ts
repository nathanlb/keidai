import { describe, expect, it } from "vitest";
import { formatCompactDuration } from "../format-compact-duration.js";

describe("formatCompactDuration", () => {
  it("formats seconds, minutes, mixed, and hours", () => {
    expect(formatCompactDuration(0)).toBe("0s");
    expect(formatCompactDuration(38_000)).toBe("38s");
    expect(formatCompactDuration(4 * 60_000)).toBe("4m");
    expect(formatCompactDuration(2 * 60_000 + 14_000)).toBe("2m 14s");
    expect(formatCompactDuration(80 * 60_000)).toBe("1h 20m");
  });
});

import { describe, expect, it } from "vitest";
import {
  formatHomeSubtitle,
  formatItemCount,
  formatScheduledFooter,
} from "../format-home-copy.js";

describe("formatHomeSubtitle", () => {
  it("calls out the queue when something is blocked", () => {
    expect(formatHomeSubtitle(3, 2)).toBe(
      "3 things want your decision. Everything else is running.",
    );
    expect(formatHomeSubtitle(1, 0)).toBe(
      "1 thing wants your decision. Everything else is running.",
    );
  });

  it("reports in-flight runs when the queue is clear", () => {
    expect(formatHomeSubtitle(0, 2)).toBe(
      "Nothing is blocked. 2 runs in flight.",
    );
    expect(formatHomeSubtitle(0, 1)).toBe(
      "Nothing is blocked. 1 run in flight.",
    );
  });
});

describe("formatItemCount", () => {
  it("pluralizes items", () => {
    expect(formatItemCount(1)).toBe("1 item");
    expect(formatItemCount(3)).toBe("3 items");
  });
});

describe("formatScheduledFooter", () => {
  it("omits the paused clause at zero", () => {
    expect(formatScheduledFooter(0, 0)).toBe("0 tasks on a trigger");
    expect(formatScheduledFooter(4, 1)).toBe("4 tasks on a trigger · 1 paused.");
  });
});

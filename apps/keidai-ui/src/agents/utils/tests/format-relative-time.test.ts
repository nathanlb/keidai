import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "../format-relative-time.js";

const NOW = new Date("2026-07-29T12:00:00.000Z").getTime();

describe("formatRelativeTime", () => {
  it("returns today for same-day timestamps", () => {
    expect(formatRelativeTime("2026-07-29T08:00:00.000Z", NOW)).toBe("today");
  });

  it("returns yesterday for a one-day delta", () => {
    expect(formatRelativeTime("2026-07-28T12:00:00.000Z", NOW)).toBe(
      "yesterday",
    );
  });

  it("returns days ago under a month", () => {
    expect(formatRelativeTime("2026-07-14T12:00:00.000Z", NOW)).toBe(
      "15d ago",
    );
  });

  it("returns months ago at or beyond 30 days", () => {
    expect(formatRelativeTime("2026-06-02T12:00:00.000Z", NOW)).toBe(
      "2mo ago",
    );
  });

  it("returns an em dash for an unparseable timestamp", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("—");
  });
});

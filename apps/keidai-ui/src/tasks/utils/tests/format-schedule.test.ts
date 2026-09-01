import { describe, expect, it } from "vitest";
import {
  formatNextRunLabel,
  formatScheduleTrigger,
} from "../format-schedule.js";

describe("formatScheduleTrigger", () => {
  it("labels on-demand and paused schedules", () => {
    expect(formatScheduleTrigger({ type: "now" })).toBe("On demand");
    expect(
      formatScheduleTrigger({
        type: "schedule",
        timezone: "UTC",
        at: "2026-09-01T09:00",
        paused: true,
      }),
    ).toBe("Paused");
  });

  it("summarizes recurrence", () => {
    expect(
      formatScheduleTrigger({
        type: "schedule",
        timezone: "UTC",
        at: "2026-09-01T09:00",
        recurrence: { freq: "daily" },
      }),
    ).toBe("Daily 09:00");
    expect(
      formatScheduleTrigger({
        type: "schedule",
        timezone: "UTC",
        at: "2026-09-01T09:00",
        recurrence: { freq: "weekly", days: ["mon", "wed"] },
      }),
    ).toBe("Weekly Mon Wed 09:00");
  });
});

describe("formatNextRunLabel", () => {
  const now = Date.parse("2026-08-24T15:00:00.000Z");

  it("labels paused, failed, missing, due, and upcoming fires", () => {
    expect(formatNextRunLabel("2026-08-25T00:00:00.000Z", true, now)).toBe(
      "Paused",
    );
    expect(
      formatNextRunLabel("2026-08-25T00:00:00.000Z", false, now, true),
    ).toBe("Failed");
    expect(formatNextRunLabel(null, false, now)).toBe("—");
    expect(formatNextRunLabel("2026-08-24T14:00:00.000Z", false, now)).toBe(
      "due",
    );
    expect(formatNextRunLabel("2026-08-25T00:00:00.000Z", false, now)).toBe(
      "in 9h",
    );
  });
});

import { describe, expect, it } from "vitest";
import { previewScheduleNextFire } from "../preview-schedule-next-fire.js";

const futureValues = {
  timezone: "UTC",
  at: "2099-01-01T09:00",
  repeat: false,
  freq: "daily" as const,
  days: ["mon" as const],
  paused: false,
};

describe("previewScheduleNextFire", () => {
  it("returns the next UTC instant for a valid one-shot", () => {
    const preview = previewScheduleNextFire(
      futureValues,
      new Date("2026-09-01T00:00:00.000Z"),
    );
    expect(preview).toEqual({
      status: "next",
      iso: "2099-01-01T09:00:00.000Z",
    });
  });

  it("returns none when the schedule is paused", () => {
    expect(
      previewScheduleNextFire(
        { ...futureValues, paused: true },
        new Date("2026-09-01T00:00:00.000Z"),
      ),
    ).toEqual({ status: "none" });
  });

  it("returns invalid for a bad timezone", () => {
    expect(
      previewScheduleNextFire({
        ...futureValues,
        timezone: "Not/AZone",
      }),
    ).toEqual({ status: "invalid" });
  });
});

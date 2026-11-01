import type { RunAttemptSummary } from "@keidai/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AttemptVerdictControl } from "../attempt-verdict-control.js";

const attempt: RunAttemptSummary = {
  attemptIndex: 1,
  outcome: "goal_met",
  outcomeReason: null,
  endedAt: "2026-07-14T12:00:10.000Z",
  verdict: null,
  note: null,
  operatorId: null,
  verdictAt: null,
};

describe("AttemptVerdictControl", () => {
  it("marks, changes, and clears a verdict", async () => {
    const user = userEvent.setup();
    const onSet = vi.fn().mockResolvedValue(undefined);
    const onClear = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <AttemptVerdictControl
        attempt={attempt}
        disabled={false}
        pending={false}
        onSet={onSet}
        onClear={onClear}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Thumbs down" }));
    expect(onSet).toHaveBeenCalledWith("down", "");

    rerender(
      <AttemptVerdictControl
        attempt={{
          ...attempt,
          verdict: "down",
          operatorId: "owner-a",
          verdictAt: "2026-07-14T12:01:00.000Z",
        }}
        disabled={false}
        pending={false}
        onSet={onSet}
        onClear={onClear}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Verdict note" }),
      "wrong",
    );
    await user.click(screen.getByRole("button", { name: "Thumbs up" }));
    expect(onSet).toHaveBeenLastCalledWith("up", "wrong");

    rerender(
      <AttemptVerdictControl
        attempt={{
          ...attempt,
          verdict: "up",
          note: "wrong",
          operatorId: "owner-a",
          verdictAt: "2026-07-14T12:02:00.000Z",
        }}
        disabled={false}
        pending={false}
        onSet={onSet}
        onClear={onClear}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Thumbs up" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("does not let a member who cannot mutate the run set a verdict", () => {
    render(
      <AttemptVerdictControl
        attempt={attempt}
        disabled
        pending={false}
        onSet={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Thumbs up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Thumbs down" })).toBeDisabled();
  });
});

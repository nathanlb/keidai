import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@keidai/ui";
import { ApprovalActions } from "../approval-actions.js";

function renderActions(
  props: Pick<
    Parameters<typeof ApprovalActions>[0],
    "canApprove" | "canDecide"
  >,
) {
  return render(
    <TooltipProvider>
      <ApprovalActions
        {...props}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onCancel={vi.fn()}
      />
    </TooltipProvider>,
  );
}

describe("ApprovalActions ownership", () => {
  it("disables approve for a non-owner and keeps reject for an admin", () => {
    renderActions({ canApprove: false, canDecide: true });

    expect(
      screen.getByRole("button", { name: "Approve & resume" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel task" })).toBeEnabled();
  });

  it("disables reject and cancel for a member who does not own the call", () => {
    renderActions({ canApprove: false, canDecide: false });

    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel task" })).toBeDisabled();
  });
});

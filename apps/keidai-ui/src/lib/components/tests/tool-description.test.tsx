import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ToolDescription } from "../tool-description.js";

const verbose =
  "Search issues across repositories using GitHub's advanced query syntax including author, label, milestone, and date filters plus sorting options that make the first sentence already too long for a rule row.";

describe("ToolDescription", () => {
  it("renders short copy without a disclosure", () => {
    render(<ToolDescription text="Send a message" />);
    expect(screen.getByText("Send a message")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show more" }),
    ).not.toBeInTheDocument();
  });

  it("collapses verbose copy and expands on demand", async () => {
    const user = userEvent.setup();
    render(<ToolDescription text={verbose} />);

    expect(screen.queryByText(verbose)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getByText(verbose)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText(verbose)).not.toBeInTheDocument();
  });
});

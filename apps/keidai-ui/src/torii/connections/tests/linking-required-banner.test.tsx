import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LinkingRequiredBanner } from "../linking-required-banner.js";
import {
  githubServer,
  linkingRequiredTrace,
} from "../../activity/utils/tests/trace-detail-fixtures.js";

describe("LinkingRequiredBanner", () => {
  it("renders mockup copy and launches link in place", async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();

    render(
      <LinkingRequiredBanner
        trace={linkingRequiredTrace}
        server={githubServer}
        onLink={onLink}
      />,
    );

    expect(
      screen.getByText("Tool call blocked — linking required"),
    ).toBeInTheDocument();
    expect(screen.getByText("search_issues")).toBeInTheDocument();
    expect(screen.getByText("nathanlb")).toBeInTheDocument();
    expect(screen.getByText("linking_required")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Link GitHub" }));

    expect(onLink).toHaveBeenCalledWith("github", "nathanlb");
  });
});

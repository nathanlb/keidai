import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TraceDetailDrawer } from "../trace-detail-drawer.js";
import {
  createMockLinkProvider,
  renderWithActivityTracesPage,
} from "../../test-utils/render-with-providers.js";
import {
  deniedTrace,
  githubServer,
  linkingRequiredTrace,
} from "../utils/tests/trace-detail-fixtures.js";

describe("TraceDetailDrawer", () => {
  it("renders denied trace sections when open", () => {
    renderWithActivityTracesPage(<TraceDetailDrawer />, {
      selectedTrace: deniedTrace,
      selectedTraceServer: githubServer,
      drawerOpen: true,
    });

    expect(screen.getByText("delete_repo")).toBeInTheDocument();
    expect(screen.getByText("trace-denied")).toBeInTheDocument();
    expect(screen.getByText("Denied by policy")).toBeInTheDocument();
    expect(screen.getByText("Trace timeline", { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText("Credential resolution", { exact: true }),
    ).toBeInTheDocument();
  });

  it("invokes linkProvider for linking_required traces", async () => {
    const user = userEvent.setup();
    const linkProvider = createMockLinkProvider();

    renderWithActivityTracesPage(<TraceDetailDrawer />, {
      selectedTrace: linkingRequiredTrace,
      selectedTraceServer: githubServer,
      drawerOpen: true,
      linkProvider,
    });

    await user.click(screen.getByRole("button", { name: "Link" }));

    expect(linkProvider).toHaveBeenCalledWith("github", "nathanlb");
  });

  it("hides the link CTA after linking is resolved in-session", () => {
    renderWithActivityTracesPage(<TraceDetailDrawer />, {
      selectedTrace: linkingRequiredTrace,
      selectedTraceServer: githubServer,
      drawerOpen: true,
      linkingResolvedKeys: new Set(["nathanlb:github"]),
    });

    expect(
      screen.queryByRole("button", { name: "Link" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when trace is null", () => {
    const { container } = renderWithActivityTracesPage(<TraceDetailDrawer />, {
      selectedTrace: null,
      drawerOpen: true,
    });

    expect(container).toBeEmptyDOMElement();
  });
});

import type { GroupServerPolicyView } from "@keidai/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GroupServerCard } from "../components/group-server-card.js";
import { TooltipProvider } from "@keidai/ui";

const policy: GroupServerPolicyView = {
  server: "gmail",
  default: "deny",
  allow: ["messages.list"],
  deny: [],
  gated: ["messages.send"],
};

describe("GroupServerCard", () => {
  it("edits a rule without rendering the whole catalogue", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <TooltipProvider>
        <GroupServerCard
          policy={policy}
          catalogue={{
            available: true,
            tools: [
              { name: "messages.send", description: "Send a message" },
              { name: "messages.list", description: "List messages" },
              { name: "messages.get", description: "Read a message" },
            ],
          }}
          connectionState="connected"
          defaultOpen
          onChange={onChange}
          onRemove={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("messages.send")).toBeInTheDocument();
    expect(screen.getByText("messages.list")).toBeInTheDocument();
    expect(screen.queryByText("messages.get")).not.toBeInTheDocument();
    expect(screen.getByText("2 of 3 tools reachable · 1 needs approval")).toBeInTheDocument();
    expect(screen.getByText("Add a tool rule")).toBeInTheDocument();
    expect(screen.getByText("1 left")).toBeInTheDocument();

    const listRow = screen.getByText("messages.list").closest("div")?.parentElement;
    expect(listRow).toBeTruthy();
    await user.click(
      screen.getAllByRole("radio", { name: "Deny" })[0]!,
    );
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as GroupServerPolicyView;
    expect(next.deny).toContain("messages.send");
    expect(next.gated).not.toContain("messages.send");
  });

  it("keeps stale names visible and marks them as not advertised", () => {
    render(
      <TooltipProvider>
        <GroupServerCard
          policy={{
            ...policy,
            allow: ["messages.list", "retired.tool"],
          }}
          catalogue={{
            available: true,
            tools: [
              { name: "messages.send", description: "Send a message" },
              { name: "messages.list", description: "List messages" },
            ],
          }}
          connectionState="connected"
          defaultOpen
          onChange={vi.fn()}
          onRemove={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("retired.tool")).toBeInTheDocument();
    expect(screen.getByText("Not currently advertised")).toBeInTheDocument();
  });
});

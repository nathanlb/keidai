import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useActingOwner } from "../use-acting-owner.js";

vi.mock("../use-fetch-agents.js", () => ({
  useFetchAgents: vi.fn(),
}));

import { useFetchAgents } from "../use-fetch-agents.js";

describe("useActingOwner", () => {
  it("returns the v0 fallback owner when no agents are loaded", () => {
    vi.mocked(useFetchAgents).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useActingOwner());

    expect(result.current.owner).toEqual({
      ownerId: "nathanlb",
      initials: "NA",
    });
  });

  it("derives initials from the first agent's ownerId", () => {
    vi.mocked(useFetchAgents).mockReturnValue({
      data: {
        agents: [
          {
            id: "agt_1",
            slug: "demo-agent",
            name: "Demo Agent",
            ownerId: "demo-user",
            groups: [],
            persona: "You are a demo agent.",
            currentPersonaVersion: 1,
            createdAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
          },
        ],
      },
      error: undefined,
      isLoading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useActingOwner());

    expect(result.current.owner).toEqual({
      ownerId: "demo-user",
      initials: "DU",
    });
  });
});

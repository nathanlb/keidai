import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useActingOwner } from "../use-acting-owner.js";

vi.mock("../use-fetch-agents.js", () => ({
  useFetchAgents: vi.fn(),
}));

import { useFetchAgents } from "../use-fetch-agents.js";

describe("useActingOwner", () => {
  it("returns a fallback owner when no agents are loaded", () => {
    vi.mocked(useFetchAgents).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useActingOwner());

    expect(result.current.owner).toEqual({
      ownerId: "unknown",
      initials: "??",
    });
  });

  it("derives initials from the first agent owner_id", () => {
    vi.mocked(useFetchAgents).mockReturnValue({
      data: {
        agents: [
          {
            agent_id: "demo",
            owner_id: "demo-user",
            subject: {
              kind: "k8s_service_account",
              namespace: "agents",
              service_account: "demo",
            },
            groups: [],
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

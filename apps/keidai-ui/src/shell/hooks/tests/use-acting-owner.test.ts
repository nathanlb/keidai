import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActingOwner } from "../use-acting-owner.js";

vi.mock("../use-fetch-agents.js", () => ({
  useFetchAgents: vi.fn(),
}));

vi.mock("../use-operator-session.js", () => ({
  useOperatorSession: vi.fn(),
}));

import { useFetchAgents } from "../use-fetch-agents.js";
import { useOperatorSession } from "../use-operator-session.js";

describe("useActingOwner", () => {
  beforeEach(() => {
    vi.mocked(useOperatorSession).mockReturnValue({
      status: "unavailable",
      principal: null,
      error: null,
      refresh: vi.fn(),
    });
    vi.mocked(useFetchAgents).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      refresh: vi.fn(),
    });
  });

  it("uses session ownerId and IdP display fields when authenticated", () => {
    vi.mocked(useOperatorSession).mockReturnValue({
      status: "authenticated",
      principal: {
        googleSub: "sub-1",
        email: "ops@example.com",
        ownerId: "demo-owner",
        name: "Ops User",
        picture: "https://example.com/p.png",
      },
      error: null,
      refresh: vi.fn(),
    });
    vi.mocked(useFetchAgents).mockReturnValue({
      data: {
        agents: [
          {
            id: "agt_1",
            slug: "other-agent",
            name: "Other",
            ownerId: "other-owner",
            groups: [],
            persona: "x",
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
      ownerId: "demo-owner",
      displayName: "Ops User",
      initials: "OU",
      picture: "https://example.com/p.png",
    });
  });

  it("falls back to demo-owner when session is unavailable and no agents", () => {
    const { result } = renderHook(() => useActingOwner());

    expect(result.current.owner).toEqual({
      ownerId: "demo-owner",
      displayName: "demo-owner",
      initials: "DO",
    });
  });

  it("falls back to the first agent's ownerId when session is unavailable", () => {
    vi.mocked(useFetchAgents).mockReturnValue({
      data: {
        agents: [
          {
            id: "agt_1",
            slug: "demo-agent",
            name: "Demo Agent",
            ownerId: "owner-a",
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
      ownerId: "owner-a",
      displayName: "owner-a",
      initials: "OA",
    });
  });
});

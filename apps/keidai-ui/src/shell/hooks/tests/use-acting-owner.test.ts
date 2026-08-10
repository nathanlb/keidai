import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActingOwner } from "../use-acting-owner.js";

vi.mock("../use-operator-session.js", () => ({
  useOperatorSession: vi.fn(),
}));

import { useOperatorSession } from "../use-operator-session.js";

describe("useActingOwner", () => {
  beforeEach(() => {
    vi.mocked(useOperatorSession).mockReturnValue({
      status: "unauthenticated",
      principal: null,
      error: null,
      refresh: vi.fn(),
    });
  });

  it("returns null when there is no authenticated session", () => {
    const { result } = renderHook(() => useActingOwner());
    expect(result.current.owner).toBeNull();
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

    const { result } = renderHook(() => useActingOwner());

    expect(result.current.owner).toEqual({
      ownerId: "demo-owner",
      displayName: "Ops User",
      initials: "OU",
      picture: "https://example.com/p.png",
    });
  });
});

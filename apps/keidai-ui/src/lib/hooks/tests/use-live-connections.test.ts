import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchConnections } from "../../api/gateway.js";
import { useLiveConnections } from "../use-live-connections.js";

vi.mock("../../api/gateway.js", () => ({
  fetchConnections: vi.fn(),
}));

class MockEventSource {
  static instances: MockEventSource[] = [];
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(_type: string, _listener: EventListener) {}

  removeEventListener(_type: string, _listener: EventListener) {}

  close() {}

  emitError() {
    this.onerror?.call(this as unknown as EventSource, new Event("error"));
  }
}

describe("useLiveConnections", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
    vi.mocked(fetchConnections).mockResolvedValue({
      connections: [{ name: "gmail", state: "connected", toolCount: 11 }],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps the snapshot when the event stream disconnects", async () => {
    const { result } = renderHook(() => useLiveConnections());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toBeUndefined();
    expect(result.current.connections.get("gmail")?.state).toBe("connected");

    act(() => {
      MockEventSource.instances.at(-1)?.emitError();
    });

    expect(result.current.error).toBeUndefined();
    expect(result.current.connections.get("gmail")?.state).toBe("connected");
  });

  it("reports an error when the snapshot fetch fails", async () => {
    vi.mocked(fetchConnections).mockRejectedValue(new Error("gateway down"));
    const { result } = renderHook(() => useLiveConnections());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.error).toEqual(
      expect.objectContaining({ message: "gateway down" }),
    );
  });
});

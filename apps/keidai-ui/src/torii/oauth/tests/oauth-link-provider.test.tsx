import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { OAuthLinkProvider } from "../context/oauth-link-provider.js";
import { useOAuthLink } from "../context/use-oauth-link.js";
import * as gatewayClient from "../../api/gateway-client.js";

vi.mock("../../api/gateway-client.js", () => ({
  fetchOAuthConnections: vi.fn(),
  initiateOAuthLink: vi.fn(),
  getGatewayOrigin: vi.fn(() => "http://127.0.0.1:3100"),
}));

vi.mock("../utils/open-oauth-popup.js", () => ({
  openOAuthPopup: vi.fn(() => ({
    closed: true,
    close: vi.fn(),
  })),
}));

function TestOpener({
  onLinked,
}: {
  onLinked: (ownerId: string, connections: unknown[]) => void | Promise<void>;
}) {
  const { openLink } = useOAuthLink();

  return (
    <button
      type="button"
      onClick={() =>
        openLink(
          {
            providerId: "github",
            providerLabel: "GitHub",
            ownerId: "owner-a",
            scopes: ["repo"],
            redirectUri: "http://127.0.0.1:3100/oauth/callback/github",
          },
          { onLinked },
        )
      }
    >
      Open link
    </button>
  );
}

describe("OAuthLinkProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(gatewayClient.initiateOAuthLink).mockResolvedValue({
      authorizationUrl: "https://github.com/login/oauth/authorize",
      linkId: "link-1",
      redirectUri: "http://127.0.0.1:3100/oauth/callback/github",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("invokes onLinked when polling observes a linked grant", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onLinked = vi.fn();
    let pollCount = 0;

    vi.mocked(gatewayClient.fetchOAuthConnections).mockImplementation(
      async () => {
        pollCount += 1;
        const status =
          pollCount >= 4 ? "linked" : pollCount >= 3 ? "pending" : "not_linked";
        return {
          connections: [
            {
              provider: "github",
              ownerId: "owner-a",
              status,
              scopes: ["repo", "read:user"],
            },
          ],
        };
      },
    );

    render(
      <OAuthLinkProvider>
        <TestOpener onLinked={onLinked} />
      </OAuthLinkProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Open link" }));
    await user.click(
      screen.getByRole("button", { name: "Open authorization" }),
    );

    await vi.advanceTimersByTimeAsync(2_500);

    await waitFor(() => {
      expect(onLinked).toHaveBeenCalledWith("owner-a", [
        {
          provider: "github",
          ownerId: "owner-a",
          status: "linked",
          scopes: ["repo", "read:user"],
        },
      ]);
    });
  });
});

import { expect, test } from "@playwright/test";
import { mockGatewayConfig } from "./helpers/mock-gateway.js";

const k8sSubject = {
  kind: "k8s_service_account" as const,
  namespace: "agents",
  service_account: "demo-agent",
};

test.describe("Agents & owners page", () => {
  test("shows the empty state when no agents are registered", async ({ page }) => {
    await mockGatewayConfig(page, {
      agents: { agents: [] },
      servers: { servers: [] },
    });

    await page.goto("/agents");

    await expect(page.getByText("No agents registered")).toBeVisible();
    await expect(
      page.getByText(/each agent acts as exactly one owner_id/i),
    ).toBeVisible();
  });

  test("groups agents by owner and lists server usage", async ({ page }) => {
    await mockGatewayConfig(page, {
      agents: {
        agents: [
          {
            agent_id: "alpha",
            owner_id: "owner-a",
            subject: k8sSubject,
            groups: ["ops"],
          },
          {
            agent_id: "beta",
            owner_id: "owner-b",
            subject: k8sSubject,
            groups: [],
          },
        ],
      },
      servers: {
        servers: [
          {
            name: "linear",
            transport: { type: "http", url: "http://127.0.0.1:3100" },
            credential: { strategy: "none" },
          },
        ],
      },
    });

    await page.goto("/agents");

    const agentsTable = page.getByRole("table");
    await expect(
      page.locator(".font-semibold").filter({ hasText: "owner-a" }),
    ).toBeVisible();
    await expect(
      page.locator(".font-semibold").filter({ hasText: "owner-b" }),
    ).toBeVisible();
    await expect(agentsTable.getByText("alpha")).toBeVisible();
    await expect(agentsTable.getByText("beta")).toBeVisible();
    await expect(agentsTable.getByText("linear").first()).toBeVisible();
    await expect(agentsTable.getByText("ops")).toBeVisible();
  });
});

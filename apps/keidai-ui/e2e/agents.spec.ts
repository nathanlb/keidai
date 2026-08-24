import { expect, test } from "@playwright/test";
import type { ManagementAgent } from "../src/lib/api/agents.js";
import { mockToriiConfig } from "./helpers/mock-torii.js";

const alphaAgent: ManagementAgent = {
  id: "agt-alpha",
  slug: "alpha",
  name: "Alpha",
  ownerId: "owner-a",
  groups: ["ops"],
  persona: "You are Alpha, an ops automation agent.",
  currentPersonaVersion: 1,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const betaAgent: ManagementAgent = {
  id: "agt-beta",
  slug: "beta",
  name: "Beta",
  ownerId: "owner-b",
  groups: [],
  persona: "You are Beta, a support triage agent.",
  currentPersonaVersion: 2,
  createdAt: "2026-07-02T00:00:00.000Z",
  updatedAt: "2026-07-05T00:00:00.000Z",
};

test.describe("Agents page", () => {
  test("shows the empty state when no agents are registered", async ({ page }) => {
    await mockToriiConfig(page, { fudaAgents: [] });

    await page.goto("/agents");

    await expect(page.getByText("No agents yet")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New agent" }).first(),
    ).toBeVisible();
  });

  test("lists registered agents with slug, groups, and owner", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaAgents: [alphaAgent, betaAgent],
    });

    await page.goto("/agents");

    const agentsTable = page.getByRole("table");
    await expect(agentsTable.getByText("Alpha", { exact: true })).toBeVisible();
    await expect(agentsTable.getByText("alpha", { exact: true })).toBeVisible();
    await expect(agentsTable.getByText("Beta", { exact: true })).toBeVisible();
    await expect(agentsTable.getByText("ops")).toBeVisible();
    await expect(agentsTable.getByText("owner-a")).toBeVisible();
    await expect(agentsTable.getByText("owner-b")).toBeVisible();
    await expect(page.getByText("Showing")).toBeVisible();
  });

  test("warns about groups Torii does not define", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaAgents: [alphaAgent],
      toriiGroups: [],
    });

    await page.goto("/agents");

    await expect(
      page.getByText(/not defined in Torii: ops/i),
    ).toBeVisible();
  });

  test("opens an agent's detail page and switches tabs", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaAgents: [alphaAgent],
      fudaBearers: [{ bearerId: "shaiden-runner", displayName: "shaiden-runner" }],
      fudaGrants: [{ bearerId: "shaiden-runner", agentId: alphaAgent.id }],
    });

    await page.goto("/agents");
    await page.getByRole("table").getByText("Alpha", { exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/agents/${alphaAgent.id}`));
    await expect(page.getByText("Alpha", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /^Access/ }).click();
    await expect(page).toHaveURL(/tab=access/);
    await expect(page.getByText("shaiden-runner").first()).toBeVisible();

    await page.getByRole("button", { name: /^Groups/ }).click();
    await expect(page).toHaveURL(/tab=groups/);
    await expect(page.getByText("ops", { exact: true })).toBeVisible();
  });

  test("creates a new agent and lands on its detail", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaAgents: [],
      fudaBearers: [{ bearerId: "shaiden-runner", displayName: "shaiden-runner" }],
    });

    await page.goto("/agents/new");

    await expect(page.getByText("assigned automatically")).toBeVisible();
    await expect(page.getByText("shaiden-runner").first()).toBeVisible();

    await page.getByPlaceholder("Agent Name").fill("Newsletter Bot");
    await page
      .getByPlaceholder("Describe how this agent should behave…")
      .fill("You are Newsletter Bot, responsible for weekly summaries.");

    const createButton = page.getByRole("button", { name: "Create agent" });
    await expect(createButton).toBeEnabled({ timeout: 10_000 });
    await createButton.click();

    await expect(page).toHaveURL(/\/agents\/agt-1$/);
    await expect(page.getByText("Newsletter Bot", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Agent created. Shaiden can run it."),
    ).toBeVisible();
  });
});

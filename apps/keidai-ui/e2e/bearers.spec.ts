import { expect, test } from "@playwright/test";
import type { Bearer, ManagementAgent } from "../src/fuda/api/fuda-client.js";
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

const grantedBearer: Bearer = {
  bearerId: "br_granted",
  displayName: "ci runner",
};

const ungrantedBearer: Bearer = {
  bearerId: "br_lonely",
  displayName: "staging smoke",
};

test.describe("Bearers page", () => {
  test("shows the empty state when no bearers are registered", async ({
    page,
  }) => {
    await mockToriiConfig(page, { fudaBearers: [] });

    await page.goto("/bearers");

    await expect(page.getByText("No bearers yet")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New bearer" }).first(),
    ).toBeVisible();
  });

  test("lists bearers with grants, mapping source, and zero-grants banner", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      fudaAgents: [alphaAgent],
      fudaBearers: [grantedBearer, ungrantedBearer],
      fudaGrants: [{ bearerId: grantedBearer.bearerId, agentId: alphaAgent.id }],
    });

    await page.goto("/bearers");

    const table = page.getByRole("table");
    await expect(table.getByText("ci runner", { exact: true })).toBeVisible();
    await expect(table.getByText("br_granted", { exact: true })).toBeVisible();
    await expect(table.getByText("alpha", { exact: true })).toBeVisible();
    await expect(table.getByText("staging smoke", { exact: true })).toBeVisible();
    await expect(table.getByText("No grants")).toBeVisible();
    await expect(table.getByText("unmapped").first()).toBeVisible();
    await expect(table.getByText("never").first()).toBeVisible();

    await expect(
      page.getByText(/1 bearer has no grants: staging smoke/i),
    ).toBeVisible();
    await expect(
      page.getByText(/403 bearer not granted for agent/),
    ).toBeVisible();
    await expect(page.getByText("Showing")).toBeVisible();
  });

  test("opens bearer detail grants tab with fail-closed empty state", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      fudaAgents: [alphaAgent],
      fudaBearers: [ungrantedBearer],
    });

    await page.goto("/bearers");
    await page
      .getByRole("table")
      .getByText("staging smoke", { exact: true })
      .click();

    await expect(page).toHaveURL(
      new RegExp(`/bearers/${ungrantedBearer.bearerId}`),
    );
    await expect(
      page.getByText("This bearer cannot act as any agent"),
    ).toBeVisible();
    await expect(
      page.getByText(/403 bearer not granted for agent/),
    ).toBeVisible();
  });

  test("registers a bearer with an optional grant and lands on Identity", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      fudaAgents: [alphaAgent],
      fudaBearers: [],
    });

    await page.goto("/bearers/new");

    await page.getByPlaceholder("github actions · ci").fill("laptop CLI");
    await page.getByRole("button", { name: /Alpha/ }).click();
    await page.getByRole("button", { name: "Register bearer" }).click();

    await expect(page).toHaveURL(/\/bearers\/br_[0-9a-f]{6}\?tab=identity/);
    await expect(page.getByText("laptop CLI", { exact: true })).toBeVisible();
    await expect(page.getByText("Display name")).toBeVisible();
    await expect(page.getByText("Exchange path")).toBeVisible();
    await expect(
      page.getByText(/registered\. Give that id to the Shaiden instance/i),
    ).toBeVisible();
  });

  test("grants and revokes an agent from the bearer Grants tab", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      fudaAgents: [alphaAgent, betaAgent],
      fudaBearers: [ungrantedBearer],
    });

    await page.goto(`/bearers/${ungrantedBearer.bearerId}`);

    await page.getByRole("button", { name: "Grant an agent" }).first().click();
    await page
      .getByRole("button", { name: "Grant", exact: true })
      .first()
      .click();

    await expect(page.getByText("Alpha", { exact: true })).toBeVisible();
    await expect(page.getByText("alpha", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/may now exchange into alpha/i),
    ).toBeVisible();

    await page.getByRole("button", { name: "Revoke" }).click();
    await expect(
      page.getByText("This bearer cannot act as any agent"),
    ).toBeVisible();
    await expect(
      page.getByText(/Exchanges for alpha now fail closed/i),
    ).toBeVisible();
  });

  test("renames a bearer from the Identity tab", async ({ page }) => {
    await mockToriiConfig(page, {
      fudaBearers: [grantedBearer],
    });

    await page.goto(`/bearers/${grantedBearer.bearerId}?tab=identity`);

    const nameInput = page.getByLabel("Display name");
    await nameInput.fill("ci runner · prod");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Display name updated.")).toBeVisible();
    await expect(
      page.getByText("ci runner · prod", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(grantedBearer.bearerId, { exact: true }).first(),
    ).toBeVisible();
  });

  test("deletes a bearer with two-step confirm and returns to the list", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      fudaAgents: [alphaAgent],
      fudaBearers: [grantedBearer],
      fudaGrants: [{ bearerId: grantedBearer.bearerId, agentId: alphaAgent.id }],
    });

    await page.goto(`/bearers/${grantedBearer.bearerId}?tab=identity`);

    await page.getByRole("button", { name: "Delete bearer" }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();

    await expect(page).toHaveURL(/\/bearers$/);
    await expect(
      page.getByText(/Bearer deleted along with 1 grant/i),
    ).toBeVisible();
    await expect(page.getByText("No bearers yet")).toBeVisible();
  });

  test("grant on Bearers is reflected on Agents Access without reload", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      fudaAgents: [alphaAgent],
      fudaBearers: [ungrantedBearer],
    });

    await page.goto(`/bearers/${ungrantedBearer.bearerId}`);
    await page.getByRole("button", { name: "Grant an agent" }).first().click();
    await page.getByRole("button", { name: "Grant", exact: true }).click();
    await expect(
      page.getByText(/may now exchange into alpha/i),
    ).toBeVisible();

    await page.goto(`/agents/${alphaAgent.id}?tab=access`);
    await expect(page.getByText("staging smoke")).toBeVisible();
    await expect(page.getByText("br_lonely")).toBeVisible();
  });

  test("grant on Agents Access is reflected on Bearers without reload", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      fudaAgents: [alphaAgent],
      fudaBearers: [ungrantedBearer],
    });

    await page.goto(`/agents/${alphaAgent.id}?tab=access`);
    await page.getByRole("button", { name: "Grant a bearer" }).click();
    await page.getByRole("button", { name: "Grant", exact: true }).click();
    await expect(
      page.getByText(/Bearer granted\. It can now act as alpha/i),
    ).toBeVisible();

    await page.goto("/bearers");
    const table = page.getByRole("table");
    await expect(table.getByText("staging smoke")).toBeVisible();
    await expect(table.getByText("alpha", { exact: true })).toBeVisible();
    await expect(page.getByText(/has no grants/i)).toHaveCount(0);
  });
});

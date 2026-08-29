import { expect, test } from "@playwright/test";
import type { GroupView } from "@keidai/shared";
import type { ManagementAgent } from "../src/lib/api/agents.js";
import { mockToriiConfig } from "./helpers/mock-torii.js";

const opsWrite: GroupView = {
  id: "grp-ops",
  name: "ops-write",
  description: "Day-to-day write access",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  servers: [
    {
      server: "gmail",
      default: "deny",
      allow: ["messages.list"],
      deny: [],
      gated: ["messages.send"],
    },
  ],
};

const opsBot: ManagementAgent = {
  id: "agt-ops",
  slug: "ops-bot",
  name: "ops-bot",
  ownerId: "owner-a",
  groups: ["ops-write", "finance-write"],
  persona: "You run ops.",
  currentPersonaVersion: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

test.describe("Policy Groups", () => {
  test("redirects /configure/groups and shows the empty state", async ({
    page,
  }) => {
    await mockToriiConfig(page);

    await page.goto("/configure/groups");

    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.getByText("No groups yet")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New group" }).first(),
    ).toBeVisible();
  });

  test("lists groups and warns about undefined names agents still join", async ({
    page,
  }) => {
    await mockToriiConfig(page, {
      toriiGroupPolicies: [opsWrite],
      fudaAgents: [opsBot],
      servers: {
        servers: [
          {
            name: "gmail",
            transport: { type: "http", url: "http://gmail.example/mcp" },
            credential: { strategy: "none" },
            policy: { default: "deny", allow: [] },
          },
        ],
      },
      connections: {
        connections: [{ name: "gmail", state: "connected", toolCount: 3 }],
      },
      serverTools: {
        gmail: {
          tools: [
            { name: "messages.send", description: "Send", allowed: true },
            { name: "messages.list", description: "List", allowed: true },
            { name: "messages.get", description: "Get", allowed: false },
          ],
        },
      },
    });

    await page.goto("/groups");

    await expect(page.getByText("ops-write")).toBeVisible();
    await expect(page.getByText("gmail")).toBeVisible();
    await expect(
      page.getByText("1 group is referenced but not defined"),
    ).toBeVisible();
    await expect(page.getByText(/finance-write/)).toBeVisible();
  });

  test("edits a tool rule and saves the policy", async ({ page }) => {
    await mockToriiConfig(page, {
      toriiGroupPolicies: [opsWrite],
      fudaAgents: [opsBot],
      servers: {
        servers: [
          {
            name: "gmail",
            transport: { type: "http", url: "http://gmail.example/mcp" },
            credential: { strategy: "none" },
            policy: { default: "deny", allow: [] },
          },
        ],
      },
      connections: {
        connections: [{ name: "gmail", state: "connected", toolCount: 3 }],
      },
      serverTools: {
        gmail: {
          tools: [
            { name: "messages.send", description: "Send a message", allowed: true },
            { name: "messages.list", description: "List messages", allowed: true },
            { name: "messages.get", description: "Read a message", allowed: false },
          ],
        },
      },
    });

    await page.goto("/groups");
    await page.getByText("ops-write").click();

    await expect(page.getByText("messages.send")).toBeVisible();
    await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();

    await page.getByRole("radio", { name: "Deny" }).first().click();
    await expect(page.getByRole("button", { name: "Save policy" })).toBeEnabled();
    await page.getByRole("button", { name: "Save policy" }).click();

    await expect(
      page.getByText("Policy saved. Applies on the next tool call."),
    ).toBeVisible();
  });

  test("creates a group from the empty state", async ({ page }) => {
    await mockToriiConfig(page, {
      servers: {
        servers: [
          {
            name: "gmail",
            transport: { type: "http", url: "http://gmail.example/mcp" },
            credential: { strategy: "none" },
            policy: { default: "deny", allow: [] },
          },
        ],
      },
    });

    await page.goto("/groups");
    await page.getByRole("button", { name: "New group" }).first().click();
    await page.getByLabel("Name").fill("ops-write");
    await page.getByLabel("Description").fill("Day-to-day write access");
    await page.getByRole("button", { name: "Create group" }).click();

    await expect(page).toHaveURL(/\/groups\/ops-write$/);
    await expect(
      page.getByRole("heading", { name: "ops-write" }).or(page.getByText("ops-write").first()),
    ).toBeVisible();
  });
});

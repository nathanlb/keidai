import { expect, test } from "@playwright/test";
import type { ApprovalRecordView } from "@keidai/shared";
import { mockToriiConfig } from "./helpers/mock-torii.js";

const pendingApproval: ApprovalRecordView = {
  id: "approval-1",
  agentId: "shaiden-newsletter-01",
  ownerId: "owner-demo",
  toolName: "gmail.send_email",
  params: {
    to: "team@example.com",
    subject: "Weekly newsletter draft",
    body: "Hello team,\n\nPlease review the attached draft.",
  },
  runId: "run-parked-1",
  stepId: "step-wait-1",
  status: "pending",
  createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
};

test.describe("Approvals panel", () => {
  test("shows empty state when no pending approvals", async ({ page }) => {
    await mockToriiConfig(page, { approvals: [] });
    await page.goto("/approvals");

    await expect(page.getByText("You're all caught up")).toBeVisible();
    await expect(page.getByRole("link", { name: "View run history" })).toBeVisible();
  });

  test("lists pending approvals with params and quick approve", async ({ page }) => {
    await mockToriiConfig(page, { approvals: [pendingApproval] });
    await page.goto("/approvals");

    await expect(page.getByText("1 pending")).toBeVisible();
    await expect(page.getByText("send_email")).toBeVisible();
    await expect(page.getByText("team@example.com")).toBeHidden();

    await page.getByRole("button", { name: "Approve and resume", exact: true }).click();
    await expect(page.getByText("You're all caught up")).toBeVisible();
    await expect(page.getByText("Approved")).toBeVisible();
  });

  test("expands a card to show captured call params", async ({ page }) => {
    await mockToriiConfig(page, { approvals: [pendingApproval] });
    await page.goto("/approvals");

    await page.getByRole("button", { name: /send_email/i }).click();
    await expect(page.getByText("team@example.com")).toBeVisible();
    await expect(page.getByText("Weekly newsletter draft")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve & resume" })).toBeVisible();
  });

  test("records a rejection with optional reason", async ({ page }) => {
    await mockToriiConfig(page, { approvals: [pendingApproval] });
    await page.goto("/approvals");

    await page.getByRole("button", { name: /send_email/i }).click();
    await page.getByRole("button", { name: "Reject" }).click();
    await page.getByPlaceholder("Optional reason for the agent…").fill("Wrong recipient list");
    await page.getByRole("button", { name: "Record denial" }).click();

    await expect(page.getByText("You're all caught up")).toBeVisible();
    await expect(page.getByText("Denied")).toBeVisible();
    await expect(page.getByText("Wrong recipient list")).toBeVisible();
  });

  test("cancels a parked task from the panel", async ({ page }) => {
    await mockToriiConfig(page, { approvals: [pendingApproval] });
    await page.goto("/approvals");

    await page.getByRole("button", { name: /send_email/i }).click();
    await page.getByRole("button", { name: "Cancel task" }).first().click();
    await page.getByRole("button", { name: "Cancel task" }).last().click();

    await expect(page.getByText("You're all caught up")).toBeVisible();
    await expect(page.getByText("Cancelled")).toBeVisible();
  });

  test("shows pending count badge in sidebar nav", async ({ page }) => {
    await mockToriiConfig(page, { approvals: [pendingApproval] });
    await page.goto("/connections");

    const approvalsLink = page.getByRole("link", { name: "Approvals" });
    await expect(approvalsLink).toContainText("1");
    await expect(page.getByText("1 awaiting review")).toBeVisible();
  });
});

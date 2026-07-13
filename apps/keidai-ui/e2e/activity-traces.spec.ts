import { PolicyDecision } from "@keidai/shared";
import type { TraceListItem } from "@keidai/shared";
import { expect, test } from "@playwright/test";
import { mockGatewayConfig } from "./helpers/mock-gateway.js";

const sampleTraces: TraceListItem[] = [
  {
    traceId: "trace-ok",
    timestamp: new Date().toISOString(),
    server: "github",
    tool: "search_issues",
    principal: { agentId: "cursor-agent", ownerId: "nathan" },
    policyDecision: PolicyDecision.Allowed,
    durationMs: 210,
    outcome: "success",
  },
  {
    traceId: "trace-denied",
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    server: "stripe",
    tool: "list_customers",
    principal: { agentId: "cursor-agent", ownerId: "nathan" },
    policyDecision: PolicyDecision.Denied,
    error: "policy denied",
    outcome: "denied",
  },
];

test.describe("Activity & traces", () => {
  test("renders metrics, filters, and opens the trace drawer", async ({
    page,
  }) => {
    await mockGatewayConfig(page, {
      traces: { traces: sampleTraces },
      traceStats: {
        windowMs: 900_000,
        callsPerMinute: 8,
        successRate: 0.5,
        p50DurationMs: 210,
        p95DurationMs: 840,
        deniedCount: 1,
        linkingRequiredCount: 0,
      },
      servers: {
        servers: [
          {
            name: "github",
            transport: { type: "http", url: "http://127.0.0.1:9001" },
            credential: { strategy: "none" },
            policy: { default: "allow" },
          },
        ],
      },
    });

    await page.goto("/activity");

    await expect(page.getByText("Calls · last 15 min")).toBeVisible();
    await expect(page.getByText("search_issues")).toBeVisible();
    await expect(page.getByText("list_customers")).toBeVisible();

    await page.getByRole("button", { name: /denied/i }).click();
    await expect(page.getByText("list_customers")).toBeVisible();
    await expect(page.getByText("search_issues")).not.toBeVisible();

    await page.getByRole("row", { name: /list_customers/i }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("trace-denied")).toBeVisible();
    await expect(drawer.getByText("Trace timeline")).toBeVisible();
    await expect(drawer.getByText("Policy decision", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Denied by policy")).toBeVisible();
    await expect(drawer.getByText("Credential resolution")).toBeVisible();
  });

  test("opens the trace drawer from a trace_id query param", async ({ page }) => {
    await mockGatewayConfig(page, {
      traces: { traces: sampleTraces },
      traceStats: {
        windowMs: 900_000,
        callsPerMinute: 8,
        successRate: 0.5,
        p50DurationMs: 210,
        p95DurationMs: 840,
        deniedCount: 1,
        linkingRequiredCount: 0,
      },
    });

    await page.goto("/activity?trace_id=trace-denied");

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("trace-denied")).toBeVisible();
    await expect(page).toHaveURL(/trace_id=trace-denied/);

    await drawer.getByRole("button", { name: "Close" }).last().click();
    await expect(drawer).not.toBeVisible();
    await expect(page).toHaveURL(/\/activity(?:\?.*)?$/);
    await expect(page.url()).not.toContain("trace_id=");
  });

  test("shows idle and no-match empty states", async ({ page }) => {
    await mockGatewayConfig(page, {
      traces: { traces: sampleTraces },
      traceStats: {
        windowMs: 900_000,
        callsPerMinute: 8,
        successRate: 0.5,
        p50DurationMs: 210,
        p95DurationMs: 840,
        deniedCount: 1,
        linkingRequiredCount: 0,
      },
    });

    await page.goto("/activity");
    await page.getByLabel("Filter traces").fill("no-such-trace");
    await expect(
      page.getByText("No traces match these filters"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByText("search_issues")).toBeVisible();
  });

  test("shows idle state when the buffer is empty", async ({ page }) => {
    await mockGatewayConfig(page);
    await page.goto("/activity");
    await expect(page.getByText("No activity yet")).toBeVisible();
  });
});

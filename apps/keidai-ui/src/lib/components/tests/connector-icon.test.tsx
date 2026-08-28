import { CONNECTOR_CATALOG } from "@keidai/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CONNECTOR_ICONS,
  ConnectorIcon,
  resolveConnectorGlyph,
} from "../connector-icon.js";

describe("resolveConnectorGlyph", () => {
  it("maps every catalog icon except brands Simple Icons does not ship", () => {
    for (const entry of CONNECTOR_CATALOG) {
      if (entry.icon === "fireflies") {
        continue;
      }
      expect(CONNECTOR_ICONS[entry.icon], entry.id).toBeDefined();
    }
  });

  it("resolves a catalog id through the catalog entry icon", () => {
    expect(resolveConnectorGlyph("google-calendar")?.title).toBe(
      "Google Calendar",
    );
    expect(resolveConnectorGlyph("github")?.title).toBe("GitHub");
  });

  it("keeps the Google G as a legacy alias", () => {
    expect(resolveConnectorGlyph("google")?.title).toBe("Google");
  });
});

describe("ConnectorIcon", () => {
  it("renders an svg for a known slug", () => {
    const { container } = render(<ConnectorIcon slug="slack" label="Slack" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(screen.queryByText("S")).not.toBeInTheDocument();
  });

  it("falls back to an initial for an unknown slug", () => {
    const { container } = render(
      <ConnectorIcon slug="fireflies" label="Fireflies" />,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("F")).toBeInTheDocument();
  });
});

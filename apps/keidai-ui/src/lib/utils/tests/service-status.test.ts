import { describe, expect, it } from "vitest";
import type { ServiceHealth } from "../../types/service-health.js";
import {
  formatEcosystemVersion,
  getServiceStatusKind,
} from "../service-status.js";

function health(
  partial: Partial<ServiceHealth> & Pick<ServiceHealth, "label">,
): ServiceHealth {
  return {
    healthy: false,
    displayAddress: "",
    version: "",
    ...partial,
  };
}

describe("getServiceStatusKind", () => {
  it("maps healthy, unreachable, and everything else", () => {
    expect(
      getServiceStatusKind(health({ healthy: true, label: "Healthy" })),
    ).toBe("healthy");
    expect(getServiceStatusKind(health({ label: "Unreachable" }))).toBe("down");
    expect(getServiceStatusKind(health({ label: "Checking…" }))).toBe(
      "degraded",
    );
    expect(getServiceStatusKind(health({ label: "Degraded" }))).toBe(
      "degraded",
    );
  });
});

describe("formatEcosystemVersion", () => {
  it("returns empty while no service has reported a version", () => {
    expect(
      formatEcosystemVersion([
        health({ label: "Checking…" }),
        health({ label: "Checking…" }),
      ]),
    ).toBe("");
  });

  it("shows the shared ecosystem version", () => {
    expect(
      formatEcosystemVersion([
        health({ healthy: true, label: "Healthy", version: "0.3.0" }),
        health({ healthy: true, label: "Healthy", version: "0.3.0" }),
        health({ healthy: true, label: "Healthy", version: "0.3.0" }),
      ]),
    ).toBe("v0.3.0");
  });

  it("does not double-prefix a version that already includes v", () => {
    expect(
      formatEcosystemVersion([
        health({ healthy: true, label: "Healthy", version: "v0.3.0" }),
      ]),
    ).toBe("v0.3.0");
  });

  it("prefers the version the most services agree on", () => {
    expect(
      formatEcosystemVersion([
        health({ healthy: true, label: "Healthy", version: "0.3.0" }),
        health({ label: "Unreachable" }),
        health({ healthy: true, label: "Healthy", version: "0.3.0" }),
        health({ healthy: true, label: "Healthy", version: "0.2.9" }),
      ]),
    ).toBe("v0.3.0");
  });
});

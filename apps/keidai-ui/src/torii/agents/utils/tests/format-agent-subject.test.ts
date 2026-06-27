import { describe, expect, it } from "vitest";
import { formatAgentSubject } from "../format-agent-subject.js";

describe("formatAgentSubject", () => {
  it("formats a Kubernetes service account subject", () => {
    expect(
      formatAgentSubject({
        kind: "k8s_service_account",
        namespace: "agents",
        service_account: "demo-agent",
      }),
    ).toBe("k8s://agents/demo-agent");
  });
});

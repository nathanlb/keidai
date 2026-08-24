import type { ManagementAgent } from "../../../../fuda/api/fuda-client.js";
import { describe, expect, it } from "vitest";
import {
  agentsInGroup,
  collectUndefinedGroups,
  otherGroupNames,
} from "../collect-undefined-groups.js";
import { formatUndefinedGroupsCopy } from "../format-groups-copy.js";

function agent(
  id: string,
  groups: string[],
): ManagementAgent {
  return {
    id,
    slug: id,
    name: id,
    ownerId: "owner",
    groups,
    persona: "p",
    currentPersonaVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("collectUndefinedGroups", () => {
  it("counts agents per unknown name and ignores known groups", () => {
    const refs = collectUndefinedGroups(
      [
        agent("a", ["ops-write", "finance-write"]),
        agent("b", ["finance-write"]),
        agent("c", ["ops-write"]),
      ],
      ["ops-write"],
    );
    expect(refs).toEqual([{ name: "finance-write", agentCount: 2 }]);
  });
});

describe("formatUndefinedGroupsCopy", () => {
  it("uses destructive-banner copy for a single undefined group", () => {
    expect(
      formatUndefinedGroupsCopy([{ name: "finance-write", agentCount: 2 }]),
    ).toEqual({
      title: "1 group is referenced but not defined",
      body: "Two agents belong to finance-write, which grants nothing because no policy defines it. Their calls are denied at the gateway. Define it or remove it from those agents.",
      defineName: "finance-write",
    });
  });
});

describe("agentsInGroup / otherGroupNames", () => {
  it("finds members and names their other groups", () => {
    const ops = agent("ops-bot", ["ops-write", "read-only"]);
    expect(agentsInGroup([ops, agent("solo", ["read-only"])], "ops-write")).toEqual([
      ops,
    ]);
    expect(otherGroupNames(ops, "ops-write")).toEqual(["read-only"]);
  });
});

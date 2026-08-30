import { describe, expect, it } from "vitest";
import type { HomeSystemMap } from "../../types/home-digest.js";
import {
  AGENT_TILE_WIDTH,
  AGENT_TOP,
  GROUP_CAP,
  RAIL_BOTTOM,
  RAIL_TOP,
  SERVER_BOTTOM,
  groupSlotCapacity,
  layoutSystemMap,
  rowCapacity,
  rowCenters,
  toriiRailLeft,
  verticalCurve,
} from "../layout-system-map.js";

function group(
  index: number,
  allGated = false,
): HomeSystemMap["groups"][number] {
  return {
    id: `grp-${index}`,
    name: `group-${index}`,
    scope: allGated ? "4 tools, all gated" : "10 tools",
    allGated,
  };
}

function server(
  index: number,
  groupIndex: number,
): HomeSystemMap["servers"][number] {
  return {
    id: `srv-${index}`,
    label: `server-${index}`,
    sub: "4 tools · oauth",
    groupId: `grp-${groupIndex}`,
  };
}

function agent(
  index: number,
  groupIndex: number,
  state: HomeSystemMap["agents"][number]["state"],
): HomeSystemMap["agents"][number] {
  return {
    id: `agt-${index}`,
    label: `agent-${index}`,
    groupId: `grp-${groupIndex}`,
    state,
    task: state === "idle" ? "no task running" : "triage-inbox · step 5 of 12",
    meta: state === "idle" ? "idle" : "2m 14s",
  };
}

function typical(): HomeSystemMap {
  return {
    workingCount: 2,
    groups: [group(0), group(1), group(2, true)],
    servers: [
      server(0, 0),
      server(1, 0),
      server(2, 1),
      server(3, 1),
      server(4, 1),
      server(5, 2),
    ],
    agents: [
      agent(0, 0, "working"),
      agent(1, 0, "idle"),
      agent(2, 1, "working"),
      agent(3, 2, "waiting"),
    ],
  };
}

describe("layoutSystemMap", () => {
  it("keeps a typical install fully visible and centred", () => {
    const layout = layoutSystemMap(typical());
    expect(layout.empty).toBe(false);
    expect(layout.servers).toHaveLength(6);
    expect(layout.groups).toHaveLength(2);
    expect(layout.groups.at(-1)?.overflow).toBe(true);
    expect(layout.agents).toHaveLength(4);
    expect(layout.servers.some((node) => node.overflow)).toBe(false);
    expect(layout.agents.some((node) => node.overflow)).toBe(false);
    expect(layout.headline).toBe("2 agents working");
    expect(layout.worldNote).toContain("6 connected");
    expect(layout.runtimeNote).toContain("4 agents, 2 working");
    expect(rowCenters(6, 150, 18)[0]).toBe(100);
    expect(layout.servers[0]?.x).toBe(100);
    expect(layout.railLeft).toBe(toriiRailLeft());
    expect(
      layout.agents.every(
        (node) => node.x + AGENT_TILE_WIDTH / 2 <= 1040,
      ),
    ).toBe(true);
  });

  it("never draws an edge from an agent to a server", () => {
    const layout = layoutSystemMap(typical());
    for (const edge of layout.edges) {
      expect(
        edge.d.includes(` ${AGENT_TOP} `) &&
          edge.d.endsWith(` ${SERVER_BOTTOM}`),
      ).toBe(false);
    }
    const serverEdges = layout.edges.filter((edge) =>
      edge.key.startsWith("edge-server-"),
    );
    const agentEdges = layout.edges.filter((edge) =>
      edge.key.startsWith("edge-agent-"),
    );
    expect(serverEdges.length).toBe(6);
    expect(agentEdges.length).toBe(4);
    for (const edge of serverEdges) {
      expect(edge.d).toContain(` ${RAIL_TOP} `);
      expect(edge.d.endsWith(` ${SERVER_BOTTOM}`)).toBe(true);
    }
    for (const edge of agentEdges) {
      expect(edge.d).toContain(` ${AGENT_TOP} `);
      expect(edge.d.endsWith(` ${RAIL_BOTTOM}`)).toBe(true);
    }
  });

  it("overflows large installs and keeps gated groups", () => {
    const map: HomeSystemMap = {
      workingCount: 3,
      groups: [
        group(0),
        group(1),
        group(2, true),
        group(3),
        group(4, true),
      ],
      servers: Array.from({ length: 14 }, (_, index) =>
        server(index, index % 5),
      ),
      agents: Array.from({ length: 11 }, (_, index) =>
        agent(
          index,
          index % 5,
          index < 3 ? "working" : index === 3 ? "waiting" : "idle",
        ),
      ),
    };

    const layout = layoutSystemMap(map);
    const serverCap = rowCapacity(150, 18);
    const agentCap = rowCapacity(188, 18);
    expect(serverCap).toBe(6);
    expect(agentCap).toBe(5);
    expect(GROUP_CAP).toBe(2);

    expect(layout.servers).toHaveLength(6);
    expect(layout.servers.at(-1)).toMatchObject({
      overflow: true,
      label: "+9 more",
      href: "/connections",
    });
    expect(layout.groups).toHaveLength(2);
    expect(layout.groups.map((node) => node.label)).toEqual([
      "group-2",
      "+4 groups",
    ]);
    expect(layout.groups[0]?.allGated).toBe(true);
    expect(layout.agents).toHaveLength(5);
    expect(layout.agents.at(-1)).toMatchObject({
      overflow: true,
      label: "+7 agents",
      href: "/agents",
    });
    expect(layout.agents.slice(0, 4).map((node) => node.label)).toEqual([
      "agent-0",
      "agent-1",
      "agent-2",
      "agent-3",
    ]);
    expect(layout.edges.some((edge) => edge.kind === "overflow")).toBe(true);
    expect(layout.worldNote).toContain("14 connected");
    expect(layout.runtimeNote).toContain("11 agents, 3 working");
  });

  it("fits more nodes when the canvas is wider", () => {
    const map: HomeSystemMap = {
      workingCount: 3,
      groups: [
        group(0),
        group(1),
        group(2, true),
        group(3),
        group(4, true),
      ],
      servers: Array.from({ length: 14 }, (_, index) =>
        server(index, index % 5),
      ),
      agents: Array.from({ length: 11 }, (_, index) =>
        agent(
          index,
          index % 5,
          index < 3 ? "working" : index === 3 ? "waiting" : "idle",
        ),
      ),
    };

    const layout = layoutSystemMap(map, 1400);
    expect(rowCapacity(150, 18, 1400)).toBe(8);
    expect(rowCapacity(188, 18, 1400)).toBe(6);
    expect(groupSlotCapacity(1400)).toBe(4);
    expect(layout.servers).toHaveLength(8);
    expect(layout.servers.at(-1)?.overflow).toBe(true);
    expect(layout.groups).toHaveLength(4);
    expect(layout.agents).toHaveLength(6);
    expect(layout.servers[0]?.x).toBe(rowCenters(8, 150, 18, 1400)[0]);
    expect(layout.railLeft).toBe(toriiRailLeft());
  });

  it("fits fewer nodes when the canvas is narrower", () => {
    const layout = layoutSystemMap(typical(), 720);
    expect(rowCapacity(150, 18, 720)).toBe(4);
    expect(layout.servers).toHaveLength(4);
    expect(layout.servers.at(-1)?.overflow).toBe(true);
    expect(groupSlotCapacity(720)).toBe(1);
    expect(layout.groups).toHaveLength(1);
  });

  it("reads quiet as nothing running without dropping nodes", () => {
    const map = typical();
    map.workingCount = 0;
    map.agents = map.agents.map((entry) => ({
      ...entry,
      state: "idle" as const,
      task: "no task running",
      meta: "idle",
    }));
    const layout = layoutSystemMap(map);
    expect(layout.headline).toBe("nothing running");
    expect(layout.agents.every((node) => node.state === "idle")).toBe(true);
    expect(layout.edges.filter((edge) => edge.kind === "working")).toHaveLength(
      0,
    );
  });

  it("uses teaching ghosts when the install is empty", () => {
    const layout = layoutSystemMap({
      servers: [],
      groups: [],
      agents: [],
      workingCount: 0,
    });
    expect(layout.empty).toBe(true);
    expect(layout.runtimeNote).toContain("0 agents, 0 working");
    expect(layout.edges).toHaveLength(0);
    expect(layout.servers[0]).toMatchObject({
      ghost: true,
      href: "/connections",
      label: "Connect a server",
    });
    expect(layout.groups[0]).toMatchObject({
      ghost: true,
      href: "/groups/new",
    });
    expect(layout.agents[0]).toMatchObject({
      ghost: true,
      href: "/agents/new",
    });
  });

  it("uses singular copy for one working agent", () => {
    const layout = layoutSystemMap({
      servers: [],
      groups: [group(0)],
      agents: [agent(0, 0, "working")],
      workingCount: 1,
    });
    expect(layout.headline).toBe("1 agent working");
    expect(layout.runtimeNote).toContain("1 agent, 1 working");
  });

  it("builds vertical cubics with control points at 45% of the delta", () => {
    expect(verticalCurve(10, 0, 20, 100)).toBe(
      "M 10 0 C 10 45 20 55 20 100",
    );
  });
});

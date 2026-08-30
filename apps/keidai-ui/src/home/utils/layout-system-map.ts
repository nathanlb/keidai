import { connectionHref } from "../../connections/navigation.js";
import {
  AGENTS_PATH,
  ACTIVITY_PATH,
  GROUPS_PATH,
} from "../../shell/navigation.js";
import type {
  HomeSystemMap,
  SystemMapAgentState,
} from "../types/home-digest.js";
import {
  formatRuntimeNote,
  formatSystemMapHeadline,
  formatWorldNote,
} from "./format-system-map.js";

export const SYSTEM_MAP_WIDTH = 1040;
export const SYSTEM_MAP_MIN_WIDTH = 640;
export const SYSTEM_MAP_HEIGHT = 412;
export const SERVER_TILE_WIDTH = 150;
export const SERVER_TILE_HEIGHT = 56;
export const SERVER_GAP = 18;
export const AGENT_TILE_WIDTH = 188;
export const AGENT_GAP = 18;
export const GROUP_CHIP_WIDTH = 200;
export const GROUP_GAP = 18;
export const FUDA_CARD_WIDTH = 181;
export const FUDA_GAP = 14;
export const SERVER_TOP = 34;
export const SERVER_BOTTOM = 90;
export const RAIL_TOP = 158;
export const RAIL_HEIGHT = 62;
export const RAIL_BOTTOM = 220;
export const RUNTIME_TOP = 262;
export const RUNTIME_HEIGHT = 132;
export const AGENT_TOP = 262;
export const AGENT_CENTER_Y = 344;
/** Offset of the group region from the left edge of the torii rail. */
export const GROUP_REGION_FROM = 316;

export const ACTIVITY_HREF = ACTIVITY_PATH;

const AGENT_RANK: Record<SystemMapAgentState, number> = {
  working: 0,
  waiting: 1,
  idle: 2,
};

export function rowCapacity(
  tile: number,
  gap: number,
  width = SYSTEM_MAP_WIDTH,
): number {
  return Math.floor((width - 16 + gap) / (tile + gap));
}

export function rowCenters(
  count: number,
  tile: number,
  gap: number,
  width = SYSTEM_MAP_WIDTH,
): number[] {
  if (count <= 0) {
    return [];
  }
  const total = count * tile + (count - 1) * gap;
  const start = (width - total) / 2;
  return Array.from(
    { length: count },
    (_, index) => start + tile / 2 + index * (tile + gap),
  );
}

export function groupRegionFrom(): number {
  return toriiRailLeft() + GROUP_REGION_FROM;
}

export function groupSlotCapacity(width = SYSTEM_MAP_WIDTH): number {
  const region = Math.max(0, width - 8 - groupRegionFrom());
  return Math.max(
    1,
    Math.floor((region - 16 + GROUP_GAP) / (GROUP_CHIP_WIDTH + GROUP_GAP)),
  );
}

export const GROUP_CAP = groupSlotCapacity();
export const GROUP_REGION_TO = SYSTEM_MAP_WIDTH - 8;

export function toriiRailLeft(): number {
  return FUDA_CARD_WIDTH + FUDA_GAP;
}

export function verticalCurve(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): string {
  const k = (by - ay) * 0.45;
  return `M ${ax} ${ay} C ${ax} ${ay + k} ${bx} ${by - k} ${bx} ${by}`;
}

function groupAnchor(slot: number, slots: number, width: number): number {
  const from = groupRegionFrom();
  const regionTo = width - 8;
  const step = (regionTo - from) / slots;
  return from + step * (slot + 0.5);
}

function pickVisible<T>(
  items: readonly T[],
  capacity: number,
  rank: (item: T) => number,
): { kept: Array<{ item: T; index: number }>; overflow: number } {
  if (items.length <= capacity) {
    return {
      kept: items.map((item, index) => ({ item, index })),
      overflow: 0,
    };
  }
  const keepCount = Math.max(0, capacity - 1);
  const kept = items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        rank(left.item) - rank(right.item) || left.index - right.index,
    )
    .slice(0, keepCount)
    .sort((left, right) => left.index - right.index);
  return { kept, overflow: items.length - keepCount };
}

export interface LaidOutServer {
  key: string;
  x: number;
  label: string;
  sub: string;
  href: string;
  overflow: boolean;
  ghost: boolean;
}

export interface LaidOutGroup {
  key: string;
  x: number;
  label: string;
  scope: string;
  href: string;
  allGated: boolean;
  overflow: boolean;
  ghost: boolean;
}

export interface LaidOutAgent {
  key: string;
  x: number;
  label: string;
  task: string;
  meta: string;
  href: string;
  state: SystemMapAgentState;
  overflow: boolean;
  ghost: boolean;
}

export type SystemMapEdgeKind =
  | "may-reach"
  | "needs-approval"
  | "working"
  | "waiting"
  | "idle"
  | "overflow";

export interface LaidOutEdge {
  key: string;
  d: string;
  kind: SystemMapEdgeKind;
}

export interface SystemMapLayout {
  servers: LaidOutServer[];
  groups: LaidOutGroup[];
  agents: LaidOutAgent[];
  edges: LaidOutEdge[];
  headline: string;
  worldNote: string;
  runtimeNote: string;
  empty: boolean;
  railLeft: number;
}

function groupHref(name?: string): string {
  if (!name) {
    return GROUPS_PATH;
  }
  return `${GROUPS_PATH}/${encodeURIComponent(name)}`;
}

function agentHref(id?: string): string {
  if (!id) {
    return AGENTS_PATH;
  }
  return `${AGENTS_PATH}/${encodeURIComponent(id)}`;
}

function emptyLayout(width: number): SystemMapLayout {
  const railLeft = toriiRailLeft();
  const serverX =
    rowCenters(1, SERVER_TILE_WIDTH, SERVER_GAP, width)[0] ?? width / 2;
  const agentX =
    rowCenters(1, AGENT_TILE_WIDTH, AGENT_GAP, width)[0] ?? width / 2;
  return {
    empty: true,
    headline: formatSystemMapHeadline(0),
    worldNote: formatWorldNote(0),
    runtimeNote: formatRuntimeNote(0, 0),
    railLeft,
    edges: [],
    servers: [
      {
        key: "ghost-server",
        x: serverX,
        label: "Connect a server",
        sub: "from the catalog",
        href: connectionHref(),
        overflow: false,
        ghost: true,
      },
    ],
    groups: [
      {
        key: "ghost-group",
        x: groupAnchor(0, 1, width),
        label: "Add a group",
        scope: "then authorise tools",
        href: `${GROUPS_PATH}/new`,
        allGated: false,
        overflow: false,
        ghost: true,
      },
    ],
    agents: [
      {
        key: "ghost-agent",
        x: agentX,
        label: "Add an agent",
        task: "then assign the group",
        meta: "",
        href: `${AGENTS_PATH}/new`,
        state: "idle",
        overflow: false,
        ghost: true,
      },
    ],
  };
}

function overflowServerEdge(options: {
  fromX: number;
  toX: number;
}): LaidOutEdge {
  return {
    key: "edge-overflow-server",
    d: verticalCurve(options.fromX, RAIL_TOP, options.toX, SERVER_BOTTOM),
    kind: "overflow",
  };
}

function overflowAgentEdge(options: {
  fromX: number;
  toX: number;
}): LaidOutEdge {
  return {
    key: "edge-overflow-agent",
    d: verticalCurve(options.fromX, AGENT_TOP, options.toX, RAIL_BOTTOM),
    kind: "overflow",
  };
}

function serverEdgeKind(gated: boolean): SystemMapEdgeKind {
  return gated ? "needs-approval" : "may-reach";
}

function agentEdgeKind(state: SystemMapAgentState): SystemMapEdgeKind {
  if (state === "working") {
    return "working";
  }
  if (state === "waiting") {
    return "waiting";
  }
  return "idle";
}

export function layoutSystemMap(
  map: HomeSystemMap,
  width = SYSTEM_MAP_WIDTH,
): SystemMapLayout {
  if (
    map.servers.length === 0 &&
    map.groups.length === 0 &&
    map.agents.length === 0
  ) {
    return emptyLayout(width);
  }

  const serverCap = rowCapacity(SERVER_TILE_WIDTH, SERVER_GAP, width);
  const agentCap = rowCapacity(AGENT_TILE_WIDTH, AGENT_GAP, width);
  const groupCap = groupSlotCapacity(width);
  const railLeft = toriiRailLeft();

  const groupsVisible = pickVisible(
    map.groups,
    groupCap,
    (group) => (group.allGated ? 0 : 1),
  );
  const visibleGroupIds = new Set(
    groupsVisible.kept.map((entry) => entry.item.id),
  );
  const groupSlots =
    groupsVisible.kept.length + (groupsVisible.overflow > 0 ? 1 : 0);
  const groupAnchors = Array.from({ length: groupSlots }, (_, slot) =>
    groupAnchor(slot, Math.max(groupSlots, 1), width),
  );
  const overflowGroupAnchor =
    groupSlots > 0 ? groupAnchors[groupSlots - 1] : undefined;

  const anchorOf = (groupId: string | null): number | undefined => {
    if (!groupId || groupSlots === 0) {
      return overflowGroupAnchor;
    }
    const slot = groupsVisible.kept.findIndex(
      (entry) => entry.item.id === groupId,
    );
    if (slot >= 0) {
      return groupAnchors[slot];
    }
    return overflowGroupAnchor;
  };

  const gatedOf = (groupId: string | null): boolean => {
    if (!groupId) {
      return false;
    }
    const visible = groupsVisible.kept.find(
      (entry) => entry.item.id === groupId,
    );
    return visible?.item.allGated ?? false;
  };

  const serversVisible = pickVisible(
    map.servers,
    serverCap,
    (server) =>
      server.groupId && visibleGroupIds.has(server.groupId) ? 0 : 1,
  );
  const serverSlots =
    serversVisible.kept.length + (serversVisible.overflow > 0 ? 1 : 0);
  const serverXs = rowCenters(
    serverSlots,
    SERVER_TILE_WIDTH,
    SERVER_GAP,
    width,
  );

  const agentsVisible = pickVisible(
    map.agents,
    agentCap,
    (agent) => AGENT_RANK[agent.state],
  );
  const agentSlots =
    agentsVisible.kept.length + (agentsVisible.overflow > 0 ? 1 : 0);
  const agentXs = rowCenters(agentSlots, AGENT_TILE_WIDTH, AGENT_GAP, width);

  const servers: LaidOutServer[] = serversVisible.kept.map((entry, slot) => ({
    key: entry.item.id,
    x: serverXs[slot] ?? 0,
    label: entry.item.label,
    sub: entry.item.sub,
    href: connectionHref(entry.item.id),
    overflow: false,
    ghost: false,
  }));
  if (serversVisible.overflow > 0) {
    servers.push({
      key: "overflow-servers",
      x: serverXs[serverSlots - 1] ?? 0,
      label: `+${serversVisible.overflow} more`,
      sub: "servers not shown",
      href: connectionHref(),
      overflow: true,
      ghost: false,
    });
  }

  const groups: LaidOutGroup[] = groupsVisible.kept.map((entry, slot) => ({
    key: entry.item.id,
    x: groupAnchors[slot] ?? 0,
    label: entry.item.name,
    scope: entry.item.scope,
    href: groupHref(entry.item.name),
    allGated: entry.item.allGated,
    overflow: false,
    ghost: false,
  }));
  if (groupsVisible.overflow > 0) {
    groups.push({
      key: "overflow-groups",
      x: overflowGroupAnchor ?? 0,
      label: `+${groupsVisible.overflow} groups`,
      scope: "not shown",
      href: GROUPS_PATH,
      allGated: false,
      overflow: true,
      ghost: false,
    });
  }

  const agents: LaidOutAgent[] = agentsVisible.kept.map((entry, slot) => ({
    key: entry.item.id,
    x: agentXs[slot] ?? 0,
    label: entry.item.label,
    task: entry.item.task,
    meta: entry.item.meta,
    href: agentHref(entry.item.id),
    state: entry.item.state,
    overflow: false,
    ghost: false,
  }));
  if (agentsVisible.overflow > 0) {
    agents.push({
      key: "overflow-agents",
      x: agentXs[agentSlots - 1] ?? 0,
      label: `+${agentsVisible.overflow} agents`,
      task: "idle or scheduled · not shown",
      meta: "",
      href: AGENTS_PATH,
      state: "idle",
      overflow: true,
      ghost: false,
    });
  }

  const edges: LaidOutEdge[] = [];
  serversVisible.kept.forEach((entry, slot) => {
    const toX = serverXs[slot];
    const fromX = anchorOf(entry.item.groupId);
    if (toX == null || fromX == null) {
      return;
    }
    edges.push({
      key: `edge-server-${entry.item.id}`,
      d: verticalCurve(fromX, RAIL_TOP, toX, SERVER_BOTTOM),
      kind: serverEdgeKind(gatedOf(entry.item.groupId)),
    });
  });
  if (serversVisible.overflow > 0 && overflowGroupAnchor != null) {
    const toX = serverXs[serverSlots - 1];
    if (toX != null) {
      edges.push(
        overflowServerEdge({ fromX: overflowGroupAnchor, toX }),
      );
    }
  }

  agentsVisible.kept.forEach((entry, slot) => {
    const fromX = agentXs[slot];
    const toX = anchorOf(entry.item.groupId);
    if (fromX == null || toX == null) {
      return;
    }
    edges.push({
      key: `edge-agent-${entry.item.id}`,
      d: verticalCurve(fromX, AGENT_TOP, toX, RAIL_BOTTOM),
      kind: agentEdgeKind(entry.item.state),
    });
  });
  if (agentsVisible.overflow > 0 && overflowGroupAnchor != null) {
    const fromX = agentXs[agentSlots - 1];
    if (fromX != null) {
      edges.push(
        overflowAgentEdge({ fromX, toX: overflowGroupAnchor }),
      );
    }
  }

  return {
    empty: false,
    servers,
    groups,
    agents,
    edges,
    headline: formatSystemMapHeadline(map.workingCount),
    worldNote: formatWorldNote(map.servers.length),
    runtimeNote: formatRuntimeNote(map.agents.length, map.workingCount),
    railLeft,
  };
}

export function edgeStroke(kind: SystemMapEdgeKind): {
  color: string;
  width: number;
  dash: string | undefined;
  opacity: number;
} {
  switch (kind) {
    case "needs-approval":
      return {
        color: "var(--amber-500)",
        width: 1.4,
        dash: "5 5",
        opacity: 0.85,
      };
    case "may-reach":
      return {
        color: "color-mix(in srgb, var(--foreground) 40%, transparent)",
        width: 1.2,
        dash: undefined,
        opacity: 0.85,
      };
    case "working":
      return {
        color: "var(--chart-1)",
        width: 1.8,
        dash: undefined,
        opacity: 1,
      };
    case "waiting":
      return {
        color: "var(--amber-500)",
        width: 1.8,
        dash: undefined,
        opacity: 1,
      };
    case "idle":
      return {
        color: "color-mix(in srgb, var(--foreground) 30%, transparent)",
        width: 1.2,
        dash: undefined,
        opacity: 0.7,
      };
    case "overflow":
      return {
        color: "color-mix(in srgb, var(--foreground) 26%, transparent)",
        width: 1,
        dash: "3 5",
        opacity: 0.7,
      };
  }
}

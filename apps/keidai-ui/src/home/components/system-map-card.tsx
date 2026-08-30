import { Card, cn } from "@keidai/ui";
import { Fingerprint, Lock, Radar } from "lucide-react";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import { useEcosystemHealth } from "../../lib/hooks/use-ecosystem-health.js";
import type { ServiceHealth } from "../../lib/types/service-health.js";
import {
  getServiceStatusKind,
  statusColorClass,
} from "../../lib/utils/service-status.js";
import type { HomeSystemMap } from "../types/home-digest.js";
import {
  ACTIVITY_HREF,
  AGENT_CENTER_Y,
  AGENT_TILE_WIDTH,
  FUDA_CARD_WIDTH,
  RAIL_HEIGHT,
  RAIL_TOP,
  RUNTIME_HEIGHT,
  RUNTIME_TOP,
  SERVER_TILE_HEIGHT,
  SERVER_TILE_WIDTH,
  SERVER_TOP,
  SYSTEM_MAP_HEIGHT,
  SYSTEM_MAP_MIN_WIDTH,
  SYSTEM_MAP_WIDTH,
  edgeStroke,
  layoutSystemMap,
  type LaidOutAgent,
  type LaidOutGroup,
  type LaidOutServer,
} from "../utils/layout-system-map.js";

const nodeHoverClass = `
  transition-colors duration-150 ease-out
  hover:border-foreground hover:bg-accent
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
  motion-reduce:transition-none
`;

function HealthDot({ status, name }: { status: ServiceHealth; name: string }) {
  const kind = getServiceStatusKind(status);
  return (
    <span
      className={cn("size-1.5 shrink-0 rounded-full", statusColorClass[kind])}
      data-testid={`system-map-health-${name}`}
      title={status.label}
      aria-label={`${name}, ${status.label}`}
      role="img"
    />
  );
}

function ServiceIdentity({
  icon,
  name,
  status,
  children,
}: {
  icon: ReactNode;
  name: string;
  status: ServiceHealth;
  children: ReactNode;
}) {
  return (
    <>
      {icon}
      <div className="text-[10.5px] leading-[1.35] text-muted-foreground">
        <div className="flex items-center gap-1.75">
          <HealthDot status={status} name={name} />
          <span className="font-mono text-[12.5px] font-semibold text-foreground">
            {name}
          </span>
        </div>
        {children}
      </div>
    </>
  );
}

function ServerTile({ node }: { node: LaidOutServer }) {
  const muted = node.overflow || node.ghost;
  return (
    <Link
      to={node.href}
      data-testid={`system-map-server-${node.key}`}
      aria-label={node.label}
      className={cn(
        "absolute z-4 flex flex-col justify-center gap-0.75 rounded-[9px] border border-dashed px-2.75 py-2 no-underline",
        nodeHoverClass,
        muted
          ? "border-border text-muted-foreground"
          : "border-[color-mix(in_srgb,var(--foreground)_20%,var(--border))] bg-[color-mix(in_srgb,var(--muted)_22%,transparent)]",
      )}
      style={{
        left: node.x,
        top: SERVER_TOP,
        width: SERVER_TILE_WIDTH,
        height: SERVER_TILE_HEIGHT,
        transform: "translateX(-50%)",
      }}
    >
      <div className="flex items-center gap-1.75">
        {muted ? null : (
          <span
            className="
            font-mono text-[9.5px] font-bold tracking-[0.04em]
            text-muted-foreground
          "
          >
            MCP
          </span>
        )}
        <span
          className={cn(
            "truncate font-mono text-[11.5px] font-semibold",
            muted ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {node.label}
        </span>
      </div>
      <div className="truncate text-[10.5px] text-muted-foreground">
        {node.sub}
      </div>
    </Link>
  );
}

function GroupChip({
  node,
  originX = 0,
}: {
  node: LaidOutGroup;
  originX?: number;
}) {
  const muted = node.overflow || node.ghost;
  return (
    <Link
      to={node.href}
      data-testid={`system-map-group-${node.key}`}
      aria-label={node.label}
      className={cn(
        "absolute z-4 flex items-center gap-2 rounded-[7px] border px-2.5 py-1.25 whitespace-nowrap no-underline",
        nodeHoverClass,
        muted
          ? "border-border bg-card"
          : node.allGated
            ? "border-[color-mix(in_srgb,var(--amber-500)_50%,var(--border))] bg-[color-mix(in_srgb,var(--amber-500)_12%,var(--card))]"
            : "border-[color-mix(in_srgb,var(--foreground)_24%,var(--border))] bg-card",
      )}
      style={{
        left: node.x - originX,
        top: "50%",
        transform: "translate(-50%, -50%)",
      }}
    >
      <span
        className={cn(
          "font-mono text-[11px] font-semibold",
          muted
            ? "text-muted-foreground"
            : node.allGated
              ? "text-amber-500"
              : "text-foreground",
        )}
      >
        {node.label}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">
        {node.scope}
      </span>
    </Link>
  );
}

function AgentChip({ node }: { node: LaidOutAgent }) {
  const muted = node.overflow || node.ghost;
  const working = !muted && node.state === "working";
  const waiting = !muted && node.state === "waiting";
  const fill = working ? "34%" : waiting ? "100%" : "0%";
  const dot = working ? "bg-chart-1" : waiting ? "bg-amber-500" : "bg-border";

  return (
    <Link
      to={node.href}
      data-testid={`system-map-agent-${node.key}`}
      aria-label={
        muted ? node.label : `${node.label}, ${node.state}, ${node.task}`
      }
      className={cn(
        "absolute z-4 flex flex-col gap-1.25 rounded-[9px] border bg-card px-2.75 pt-2 pb-2.25 no-underline",
        nodeHoverClass,
        working
          ? "border-[color-mix(in_srgb,var(--chart-1)_45%,var(--border))]"
          : waiting
            ? "border-[color-mix(in_srgb,var(--amber-500)_45%,var(--border))]"
            : "border-border",
      )}
      style={{
        left: node.x,
        top: AGENT_CENTER_Y,
        width: AGENT_TILE_WIDTH,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="flex items-center gap-1.75">
        <span
          className={cn("size-1.5 shrink-0 rounded-full", dot)}
          data-system-map-pulse={working ? "" : undefined}
          aria-hidden
        />
        <span
          className={cn(
            "min-w-0 truncate font-mono text-[11.5px] font-semibold",
            muted ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {node.label}
        </span>
        {node.meta ? (
          <span
            className="
            ml-auto shrink-0 font-mono text-[10px] text-muted-foreground
          "
          >
            {node.meta}
          </span>
        ) : null}
      </div>
      <div className="truncate text-[10.5px] text-muted-foreground">
        {node.task}
      </div>
      <div className="h-0.5 overflow-hidden rounded-sm bg-border">
        <div
          className={cn(
            "h-full rounded-sm",
            working ? "bg-chart-1" : waiting ? "bg-amber-500" : "bg-border",
          )}
          data-system-map-creep={working ? "" : undefined}
          style={{ width: fill }}
        />
      </div>
    </Link>
  );
}

export function SystemMapCard({ map }: { map: HomeSystemMap }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(SYSTEM_MAP_WIDTH);
  const { torii, fuda, shaiden } = useEcosystemHealth();

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const readWidth = () => {
      const next = Math.round(host.clientWidth);
      if (next > 0) {
        setWidth(next);
      }
    };
    readWidth();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(readWidth);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const canvasWidth = Math.max(width, SYSTEM_MAP_MIN_WIDTH);
  const layout = useMemo(
    () => layoutSystemMap(map, canvasWidth),
    [map, canvasWidth],
  );

  return (
    <Card
      data-testid="home-system-map"
      className="overflow-hidden py-0 shadow-none"
    >
      <div
        className="
        flex flex-wrap items-center gap-2.25 border-b border-border px-4.5 py-3.5
      "
      >
        <Radar className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">System map</h2>
        <span className="font-mono text-[11.5px] text-muted-foreground">
          {layout.headline}
        </span>
        <div
          className="
          ml-auto flex flex-wrap items-center gap-4 text-[11.5px]
          text-muted-foreground
        "
        >
          <span className="flex items-center gap-1.5">
            <span
              className="
                w-3.5 border-t
                border-[color-mix(in_srgb,var(--foreground)_40%,transparent)]
              "
              aria-hidden
            />
            May reach
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="w-3.5 border-t border-dashed border-amber-500"
              aria-hidden
            />
            Needs approval
          </span>
          <Link
            to={ACTIVITY_HREF}
            className="text-muted-foreground no-underline hover:text-foreground"
          >
            Gateway activity →
          </Link>
        </div>
      </div>

      <div className="px-4.5">
        <div ref={hostRef} className="overflow-x-auto overflow-y-hidden">
          <div
            className="relative"
            style={{ width: canvasWidth, height: SYSTEM_MAP_HEIGHT }}
          >
            <svg
              viewBox={`0 0 ${canvasWidth} ${SYSTEM_MAP_HEIGHT}`}
              width={canvasWidth}
              height={SYSTEM_MAP_HEIGHT}
              className="pointer-events-none absolute top-0 left-0 z-2 overflow-visible"
              aria-hidden
            >
              {layout.edges.map((edge) => {
                const stroke = edgeStroke(edge.kind);
                return (
                  <path
                    key={edge.key}
                    d={edge.d}
                    fill="none"
                    stroke={stroke.color}
                    strokeWidth={stroke.width}
                    strokeLinecap="round"
                    strokeDasharray={stroke.dash}
                    opacity={stroke.opacity}
                  />
                );
              })}
            </svg>

            <div className="absolute top-2 left-0 z-4 flex w-full items-baseline gap-2.25">
              <span
                className="
              text-[10.5px] font-semibold tracking-[0.07em] text-muted-foreground
              uppercase
            "
              >
                Outside world
              </span>
              <span className="text-[11px] text-muted-foreground">
                {layout.worldNote}
              </span>
            </div>

            {layout.servers.map((node) => (
              <ServerTile key={node.key} node={node} />
            ))}

            <div
              data-testid="system-map-fuda"
              className="
                absolute z-4 overflow-hidden rounded-[11px] border border-border
                bg-[color-mix(in_srgb,var(--muted)_30%,transparent)]
              "
              style={{
                top: RAIL_TOP,
                left: 0,
                width: FUDA_CARD_WIDTH,
                height: RAIL_HEIGHT,
              }}
              aria-label={`Fuda, ${fuda.label}`}
            >
              <div className="flex h-full items-center gap-2.5 pr-4.5 pl-3.5">
                <ServiceIdentity
                  icon={<Fingerprint className="size-4 shrink-0" aria-hidden />}
                  name="fuda"
                  status={fuda}
                >
                  issues identity for
                  <br />
                  every running agent
                </ServiceIdentity>
              </div>
            </div>

            <div
              className="
              absolute z-4 overflow-visible rounded-[11px] border
              border-[color-mix(in_srgb,var(--foreground)_34%,var(--border))]
              whitespace-nowrap
            "
              style={{
                top: RAIL_TOP,
                left: layout.railLeft,
                width: canvasWidth - layout.railLeft,
                height: RAIL_HEIGHT,
                background:
                  "linear-gradient(color-mix(in srgb, var(--muted) 78%, transparent), color-mix(in srgb, var(--muted) 46%, transparent))",
              }}
            >
              <div
                className="
              absolute top-0 left-3.5 flex h-full items-center gap-2.5
              border-r border-border pr-4.5
            "
              >
                <ServiceIdentity
                  icon={<Lock className="size-4 shrink-0" aria-hidden />}
                  name="torii"
                  status={torii}
                >
                  authorises every call against
                  <br />
                  the running agent&apos;s group
                </ServiceIdentity>
              </div>
              {layout.groups.map((node) => (
                <GroupChip
                  key={node.key}
                  node={node}
                  originX={layout.railLeft}
                />
              ))}
            </div>

            <div
              className="
              absolute left-0 z-1 rounded-[11px] border border-border
              bg-[color-mix(in_srgb,var(--muted)_30%,transparent)]
            "
              style={{
                top: RUNTIME_TOP,
                width: canvasWidth,
                height: RUNTIME_HEIGHT,
              }}
            />
            <div
              className="
            absolute top-[274px] left-3.5 z-4 flex min-w-0 items-center gap-2.25
            pr-2
          "
              style={{ maxWidth: canvasWidth - 14 }}
            >
              <HealthDot status={shaiden} name="shaiden" />
              <span
                className="
              text-[10.5px] font-semibold tracking-[0.07em] text-foreground
              uppercase
            "
              >
                shaiden runtime
              </span>
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                {layout.runtimeNote}
              </span>
            </div>

            {layout.agents.map((node) => (
              <AgentChip key={node.key} node={node} />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

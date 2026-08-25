import { Alert, AlertDescription, Badge, Spinner, cn } from "@keidai/ui";
import type { ConnectionStatus, GroupView } from "@keidai/shared";
import { TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { ServerCatalogue } from "../groups/types/group-editor.js";
import { GROUPS_PATH } from "../shell/navigation.js";
import { SegmentedFilter } from "./components/segmented-filter.js";
import {
  filterEffectiveTools,
  resolveEffectiveTools,
  type EffectiveToolState,
  type EffectiveToolsFilter,
} from "./utils/resolve-effective-tools.js";

const CHIP: Record<EffectiveToolState, { label: string; className: string }> = {
  permit: {
    label: "Permitted",
    className:
      "bg-[color-mix(in_srgb,var(--green-600)_18%,transparent)] text-(--green-600)",
  },
  gated: {
    label: "Approval",
    className:
      "bg-[color-mix(in_srgb,var(--amber-500)_18%,transparent)] text-amber-500",
  },
  deny: {
    label: "Blocked",
    className: "bg-muted text-muted-foreground",
  },
};

function healthClass(state: ConnectionStatus["state"] | undefined): string {
  if (state === "connected") {
    return "bg-(--green-600)";
  }
  if (state === "failed") {
    return "bg-destructive";
  }
  return "bg-muted-foreground";
}

export function AgentEffectiveToolsPanel({
  membership,
  groups,
  catalogues,
  cataloguesLoading,
  connections,
}: {
  membership: readonly string[];
  groups: readonly GroupView[];
  catalogues: Readonly<Record<string, ServerCatalogue>>;
  cataloguesLoading: boolean;
  connections: ReadonlyMap<string, ConnectionStatus>;
}) {
  const [filter, setFilter] = useState<EffectiveToolsFilter>("permit");
  const result = useMemo(
    () => resolveEffectiveTools(membership, groups, catalogues),
    [catalogues, groups, membership],
  );
  const visible = useMemo(
    () => filterEffectiveTools(result, filter),
    [filter, result],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="
        flex flex-wrap items-start justify-between gap-3.5 border-b
        border-border px-4.5 py-3.5
      ">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold">Effective tools</span>
            <Badge variant="secondary" className="text-[10.5px]">
              computed
            </Badge>
          </div>
          <p className="mt-0.5 text-xs/normal text-muted-foreground">
            {result.permittedCount} permitted · {result.gatedCount} gated ·{" "}
            {result.deniedCount} denied, resolved across{" "}
            {result.definedGroupCount} defined group
            {result.definedGroupCount === 1 ? "" : "s"}.
          </p>
        </div>
        <SegmentedFilter
          ariaLabel="Filter effective tools"
          value={filter}
          onChange={setFilter}
          options={[
            {
              value: "permit",
              label: "Permitted",
              count: result.permittedCount,
            },
            { value: "gated", label: "Approval", count: result.gatedCount },
            { value: "deny", label: "Blocked", count: result.deniedCount },
            {
              value: "all",
              label: "All",
              count:
                result.permittedCount + result.gatedCount + result.deniedCount,
            },
          ]}
        />
      </div>

      {result.conflicts.length > 0 ? (
        <Alert className="
          rounded-none border-0 border-b border-border
          bg-[color-mix(in_srgb,var(--amber-500)_8%,transparent)] px-4.5 py-3
        ">
          <TriangleAlert className="text-amber-500" aria-hidden />
          <AlertDescription className="
            text-[12.5px] leading-normal text-foreground
          ">
            {result.conflicts.length === 1
              ? `1 tool this agent would otherwise reach is blocked by a deny in another of its groups — ${result.conflicts[0]?.tool}. Deny always wins, so joining more groups can never unblock it.`
              : `${result.conflicts.length} tools this agent would otherwise reach are blocked by a deny in another of its groups — ${result.conflicts.map((conflict) => conflict.tool).join(", ")}. Deny always wins, so joining more groups can never unblock them.`}
          </AlertDescription>
        </Alert>
      ) : null}

      {cataloguesLoading && result.servers.length === 0 ? (
        <div className="
          flex items-center gap-2 px-4.5 py-4 text-sm text-muted-foreground
        ">
          <Spinner className="size-4" aria-hidden />
          Resolving tools…
        </div>
      ) : result.servers.length === 0 ? (
        <p className="
          px-4.5 py-4 text-[12.5px] leading-normal text-muted-foreground
        ">
          Join a defined group to see what this agent can reach.
        </p>
      ) : (
        visible.map((server) => (
          <div key={server.name}>
            <div className="
              flex items-center gap-2.5 border-b border-border bg-muted/40
              px-4.5 py-2.5
            ">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  healthClass(connections.get(server.name)?.state),
                )}
                aria-hidden
              />
              <span className="font-mono text-[12.5px] font-semibold">
                {server.name}
              </span>
              <span className="text-[11.5px] text-muted-foreground">
                {server.tools.filter((tool) => tool.state !== "deny").length} of{" "}
                {server.tools.length} reachable
              </span>
              <span className="
                ml-auto font-mono text-[11.5px] text-muted-foreground
              ">
                via {server.via.join(" + ")}
              </span>
            </div>
            {server.catalogueAvailable ? null : (
              <p className="
                border-b border-border px-4.5 py-2.5 text-[12px] text-amber-500
              ">
                {server.unavailableReason ??
                  "Tool catalogue unavailable — showing named policy rules only."}
              </p>
            )}
            {filter !== "all" &&
            server.tools.filter((tool) => tool.state === filter).length ===
              0 ? (
              <p className="
                border-b border-border px-4.5 py-3 text-xs text-muted-foreground
              ">
                No tools in this filter.
              </p>
            ) : (
              (filter === "all"
                ? server.tools
                : server.tools.filter((tool) => tool.state === filter)
              ).map((tool) => {
                const chip = CHIP[tool.state];
                return (
                  <div
                    key={`${server.name}:${tool.name}`}
                    className="
                      flex items-center gap-3 border-b border-border px-4.5
                      py-2.5
                      hover:bg-muted/45
                    "
                  >
                    <span
                      className={cn(
                        `
                          inline-flex w-19.5 shrink-0 justify-center
                          rounded-full px-2 py-0.5 text-[11px] font-semibold
                        `,
                        chip.className,
                      )}
                    >
                      {chip.label}
                    </span>
                    <div
                      className={cn(
                        `
                          min-w-0 flex-1 truncate font-mono text-[12.5px]
                          font-medium
                        `,
                        tool.state === "deny"
                          ? "text-muted-foreground"
                          : "text-foreground",
                      )}
                    >
                      {tool.name}
                    </div>
                    <div
                      className={cn(
                        `
                          max-w-67.5 shrink-0 text-right text-[11.5px]
                          leading-snug
                        `,
                        tool.conflict || tool.defaultAllow
                          ? "text-amber-500"
                          : "text-muted-foreground",
                      )}
                    >
                      {tool.reason}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ))
      )}

      <p className="
        px-4.5 py-3 text-[11.5px] leading-normal text-muted-foreground
      ">
        This is the decision the gateway will make. To change it, edit the group
        under{" "}
        <Link to={GROUPS_PATH} className="
          text-foreground
          hover:underline
        ">
          Configure → Groups &amp; tools
        </Link>
        .
      </p>
    </div>
  );
}

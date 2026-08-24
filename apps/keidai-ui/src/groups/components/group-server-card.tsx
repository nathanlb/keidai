import { Button, Card, CardContent, cn } from "@keidai/ui";
import type { ConnectionState, GroupServerPolicyView } from "@keidai/shared";
import { ChevronDown, HardDrive, X } from "lucide-react";
import { useState } from "react";
import type { ServerCatalogue, ToolEffect } from "../types/group-editor.js";
import {
  invertedDefaultEffect,
  removeToolRule,
  setServerDefault,
  setToolRule,
} from "../utils/mutate-server-policy.js";
import {
  listExplicitRules,
  listUnruledTools,
} from "../utils/list-explicit-rules.js";
import {
  countServerGrants,
  unruledToolCount,
} from "../utils/count-group-grants.js";
import {
  formatCatalogueUnavailable,
  formatDefaultExplain,
  formatEverythingElseCount,
  formatServerSummary,
} from "../utils/format-groups-copy.js";
import { AddToolRule } from "./add-tool-rule.js";
import { ToolDescription } from "../../lib/components/tool-description.js";
import {
  PolicyDefaultControl,
  PolicyEffectControl,
} from "./policy-effect-control.js";

const healthDotClass: Record<ConnectionState, string> = {
  connected: "bg-(--green-600)",
  connecting: "bg-muted-foreground",
  failed: "bg-destructive",
};

export function GroupServerCard({
  policy,
  catalogue,
  connectionState,
  defaultOpen,
  onChange,
  onRemove,
}: {
  policy: GroupServerPolicyView;
  catalogue: ServerCatalogue | undefined;
  connectionState: ConnectionState | undefined;
  defaultOpen: boolean;
  onChange: (next: GroupServerPolicyView) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const tools = catalogue?.available ? catalogue.tools : [];
  const catalogueReady = catalogue?.available === true;
  const rules = listExplicitRules(policy, tools);
  const unruled = listUnruledTools(policy, tools);
  const grants = countServerGrants(policy, catalogueReady ? tools : undefined);
  const remaining = unruledToolCount(
    policy,
    catalogueReady ? tools : undefined,
  );
  const isAllowDefault = policy.default === "allow";
  const health = connectionState ?? "connecting";

  return (
    <Card className="overflow-hidden shadow-none">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left hover:bg-muted/45"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <HardDrive className="size-3.75" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[14.5px] font-semibold">
              {policy.server}
            </span>
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                healthDotClass[health],
              )}
              aria-hidden
            />
          </div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">
            {formatServerSummary(grants.reachable, grants.total, grants.gated)}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[11px]",
            isAllowDefault
              ? "border-amber-500/50 text-amber-500"
              : "border-border text-muted-foreground",
          )}
        >
          {isAllowDefault ? "default allow" : "default deny"}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <CardContent className="border-t border-border p-0">
          {rules.length === 0 ? (
            <div className="border-b border-border px-4.5 py-3.5 text-[12.5px] leading-relaxed text-muted-foreground">
              No tool-level rules. Every tool on this server follows the default
              below.
            </div>
          ) : (
            rules.map((rule) => (
              <div
                key={rule.name}
                className="flex items-start gap-3 border-b border-border px-4.5 py-2.75 hover:bg-muted/45"
              >
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "font-mono text-[13px] font-medium",
                      rule.effect === "denied"
                        ? "text-muted-foreground"
                        : "text-foreground",
                    )}
                  >
                    {rule.name}
                  </div>
                  {rule.description ? (
                    <ToolDescription text={rule.description} />
                  ) : null}
                </div>
                <PolicyEffectControl
                  value={rule.effect}
                  onChange={(next: ToolEffect) =>
                    onChange(setToolRule(policy, rule.name, next))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6.5 shrink-0 text-muted-foreground hover:bg-accent"
                  title="Remove this rule — the tool falls back to the default"
                  onClick={() => onChange(removeToolRule(policy, rule.name))}
                >
                  <X className="size-3.5" aria-hidden />
                </Button>
              </div>
            ))
          )}

          <div className="border-b border-border px-4.5 py-2.75">
            <AddToolRule
              unruled={unruled}
              addsAs={invertedDefaultEffect(policy.default)}
              disabled={!catalogueReady}
              disabledReason={
                catalogue?.unavailableReason ??
                formatCatalogueUnavailable(connectionState)
              }
              onAdd={(tool) =>
                onChange(
                  setToolRule(
                    policy,
                    tool.name,
                    invertedDefaultEffect(policy.default),
                  ),
                )
              }
            />
          </div>

          <div className="flex items-center gap-3 bg-muted/40 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold">
                Everything else on this server{" "}
                {catalogueReady ? (
                  <span className="font-mono font-medium text-muted-foreground">
                    {formatEverythingElseCount(remaining)}
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                {formatDefaultExplain(policy.default)}
              </div>
            </div>
            <PolicyDefaultControl
              value={policy.default}
              onChange={(next) => onChange(setServerDefault(policy, next))}
            />
          </div>

          <div className="flex justify-end px-4 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[12px] text-muted-foreground hover:text-destructive"
              onClick={onRemove}
            >
              Remove this server
            </Button>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

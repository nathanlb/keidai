import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@keidai/ui";
import { KeyRound } from "lucide-react";
import { useMemo } from "react";
import type { Bearer, Grant, ManagementAgent } from "../api/fuda-client.js";
import { PLATFORM_BEARER_ID } from "../platform-bearer.js";

export interface AgentAccessPanelProps {
  agent: ManagementAgent;
  bearers: Bearer[];
  grants: Grant[];
}

export function AgentAccessPanel({
  agent,
  bearers,
  grants,
}: AgentAccessPanelProps) {
  const grantedBearerIds = useMemo(
    () => new Set(grants.map((grant) => grant.bearerId)),
    [grants],
  );
  const runner =
    bearers.find(
      (bearer) =>
        bearer.bearerId === PLATFORM_BEARER_ID &&
        grantedBearerIds.has(bearer.bearerId),
    ) ??
    bearers.find((bearer) => grantedBearerIds.has(bearer.bearerId)) ??
    bearers.find((bearer) => bearer.bearerId === PLATFORM_BEARER_ID);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card px-4.5 py-4">
        <p className="text-[13.5px] leading-relaxed">
          {agent.slug} runs on the Shaiden runtime in this ecosystem.
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          Fuda assigns that runtime automatically. There is nothing to choose
          here — Shaiden is the only process that can act as an agent.
        </p>
      </div>

      <Card className="shadow-none">
        <CardHeader className="border-b border-border px-4.5 py-3.5">
          <CardTitle className="text-sm">Runtime</CardTitle>
          <CardDescription>
            Assigned when this agent was created.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4.5 py-4">
          {runner ? (
            <div className="flex items-center gap-2.5">
              <span className="flex size-6.5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <KeyRound className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">
                  {runner.displayName}
                </div>
                <div className="truncate font-mono text-[11.5px] text-muted-foreground">
                  {runner.bearerId}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              The Shaiden runtime is not listed yet. Restart Fuda so it can seed{" "}
              {PLATFORM_BEARER_ID}.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

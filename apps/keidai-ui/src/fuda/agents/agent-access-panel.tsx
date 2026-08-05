import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@keidai/ui";
import { KeyRound, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { Bearer, Grant, ManagementAgent } from "../api/fuda-client.js";

export interface AgentAccessPanelProps {
  agent: ManagementAgent;
  bearers: Bearer[];
  grants: Grant[];
  onGrant: (bearerId: string) => Promise<void>;
  onRevoke: (bearerId: string) => Promise<void>;
}

export function AgentAccessPanel({
  agent,
  bearers,
  grants,
  onGrant,
  onRevoke,
}: AgentAccessPanelProps) {
  const [granting, setGranting] = useState(false);
  const [pendingBearerId, setPendingBearerId] = useState<string | null>(null);

  const grantedBearerIds = useMemo(
    () => new Set(grants.map((grant) => grant.bearerId)),
    [grants],
  );
  const grantedBearers = bearers.filter((bearer) =>
    grantedBearerIds.has(bearer.bearerId),
  );
  const candidateBearers = bearers.filter(
    (bearer) => !grantedBearerIds.has(bearer.bearerId),
  );

  const groupCount = agent.groups.length;
  const sentence =
    grantedBearers.length === 0
      ? `No process can currently act as ${agent.slug}.`
      : `${grantedBearers.length} bearer${grantedBearers.length === 1 ? "" : "s"} can act as ${agent.slug}, inheriting its ${groupCount} group${groupCount === 1 ? "" : "s"}.`;

  async function handleGrant(bearerId: string) {
    setPendingBearerId(bearerId);
    try {
      await onGrant(bearerId);
      setGranting(false);
    } finally {
      setPendingBearerId(null);
    }
  }

  async function handleRevoke(bearerId: string) {
    setPendingBearerId(bearerId);
    try {
      await onRevoke(bearerId);
    } finally {
      setPendingBearerId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card px-[18px] py-4">
        <p className="text-[13.5px] leading-relaxed">{sentence}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          A bearer has no permissions of its own. Granting one here lets that
          process obtain tokens as{" "}
          <span className="font-mono text-foreground">{agent.slug}</span> and
          use exactly this agent&apos;s groups — nothing more.
        </p>
      </div>

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border px-[18px] py-3.5">
          <div className="text-sm font-semibold">Granted bearers</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setGranting((prev) => !prev)}
          >
            <Plus className="size-3.5" aria-hidden />
            Grant a bearer
          </Button>
        </CardHeader>

        {granting ? (
          <div className="border-b border-border bg-muted/30 px-[18px] py-3.5">
            <div className="mb-2 text-xs text-muted-foreground">
              Bearers registered in Fuda that cannot yet act as this agent:
            </div>
            <div className="flex flex-col gap-1.5">
              {candidateBearers.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  Every registered bearer already has a grant.
                </p>
              ) : (
                candidateBearers.map((bearer) => (
                  <div
                    key={bearer.bearerId}
                    className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">
                        {bearer.displayName}
                      </div>
                      <div className="truncate font-mono text-[11.5px] text-muted-foreground">
                        {bearer.bearerId}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="ml-auto shrink-0"
                      disabled={pendingBearerId === bearer.bearerId}
                      onClick={() => void handleGrant(bearer.bearerId)}
                    >
                      Grant
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {grantedBearers.length > 0 ? (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-auto py-2.5 pl-[18px] text-xs font-medium">
                    Bearer
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-xs font-medium">
                    Granted
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-xs font-medium">
                    Last token
                  </TableHead>
                  <TableHead className="h-auto py-2.5 pr-[18px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grantedBearers.map((bearer) => (
                  <TableRow key={bearer.bearerId}>
                    <TableCell className="py-3 pl-[18px]">
                      <Link
                        to={`/bearers/${encodeURIComponent(bearer.bearerId)}`}
                        className="flex items-center gap-2.5 hover:opacity-90"
                      >
                        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <KeyRound className="size-3.5" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold">
                            {bearer.displayName}
                          </div>
                          <div className="truncate font-mono text-[11.5px] text-muted-foreground">
                            {bearer.bearerId}
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="py-3 font-mono text-[12.5px] text-muted-foreground">
                      —
                    </TableCell>
                    <TableCell className="py-3 font-mono text-[12.5px] text-muted-foreground">
                      —
                    </TableCell>
                    <TableCell className="py-3 pr-[18px] text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={pendingBearerId === bearer.bearerId}
                        onClick={() => void handleRevoke(bearer.bearerId)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        ) : (
          <div className="px-6 py-10 text-center">
            <div className="text-sm font-semibold">
              No bearer can act as this agent
            </div>
            <p className="mx-auto mt-1.5 max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">
              The token endpoint will refuse every request for{" "}
              <span className="font-mono">{agent.slug}</span> until a bearer
              is granted.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

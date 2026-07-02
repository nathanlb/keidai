import {
  Badge,
  Button,
  TableCell,
  TableRow,
} from "@keidai/ui";
import type { ConnectionState } from "@keidai/shared";
import {
  CircleAlert,
  Link2,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CredentialStrategyBadge } from "./connections-summary-tiles.js";
import type { ServerConnectionSummary } from "./utils/build-server-summaries.js";

const connectionStateMeta: Record<
  ConnectionState,
  { label: string; dotClass: string; badgeClass: string }
> = {
  connected: {
    label: "Connected",
    dotClass: "bg-success",
    badgeClass: "border-transparent bg-secondary text-secondary-foreground",
  },
  connecting: {
    label: "Connecting",
    dotClass: "bg-muted-foreground",
    badgeClass: "border-border bg-background text-foreground",
  },
  failed: {
    label: "Failed",
    dotClass: "",
    badgeClass:
      "border-transparent bg-destructive text-destructive-foreground",
  },
};

function ConnectionStatusBadge({ state }: { state: ConnectionState }) {
  const meta = connectionStateMeta[state];

  return (
    <Badge variant="outline" className={`gap-1.5 ${meta.badgeClass}`}>
      {state === "connecting" ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : state === "connected" ? (
        <span className={`size-1.5 rounded-full ${meta.dotClass}`} aria-hidden />
      ) : null}
      {meta.label}
    </Badge>
  );
}

function RowOverflowMenu({
  serverName,
  onReconnect,
}: {
  serverName: string;
  onReconnect: (serverName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground"
        aria-label={`More actions for ${serverName}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute top-[calc(100%+4px)] right-0 z-10 min-w-[140px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              setOpen(false);
              onReconnect(serverName);
            }}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Reconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RowActions({
  summary,
  onReconnect,
  onLink,
  isReconnecting,
}: {
  summary: ServerConnectionSummary;
  onReconnect: (serverName: string) => void;
  onLink: (providerId: string) => void;
  isReconnecting: boolean;
}) {
  if (summary.rowAction === "reconnect") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isReconnecting}
        onClick={() => onReconnect(summary.name)}
      >
        <RefreshCw
          className={`size-3.5 ${isReconnecting ? "animate-spin" : ""}`}
          aria-hidden
        />
        Reconnect
      </Button>
    );
  }

  if (summary.rowAction === "link" && summary.linkProviderId) {
    return (
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={() => onLink(summary.linkProviderId!)}
      >
        <Link2 className="size-3.5" aria-hidden />
        Link
      </Button>
    );
  }

  return (
    <RowOverflowMenu serverName={summary.name} onReconnect={onReconnect} />
  );
}

function CredentialSubStatus({
  label,
  warning,
}: {
  label: string;
  warning: boolean;
}) {
  if (!warning) {
    return <span className="text-xs text-muted-foreground">{label}</span>;
  }

  return (
    <span className="flex items-center gap-1 text-xs text-warning">
      <TriangleAlert className="size-3 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

export function ConnectionServerRow({
  summary,
  onReconnect,
  onLink,
  isReconnecting,
}: {
  summary: ServerConnectionSummary;
  onReconnect: (serverName: string) => void;
  onLink: (providerId: string) => void;
  isReconnecting: boolean;
}) {
  return (
    <TableRow className="border-border hover:bg-muted/30">
      <TableCell className="py-3 pl-[18px] font-semibold">
        {summary.name}
      </TableCell>
      <TableCell className="max-w-[220px] py-3">
        <div className="truncate font-mono text-xs text-muted-foreground">
          {summary.endpoint}
        </div>
        {summary.state === "failed" && summary.error ? (
          <div className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
            <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>{summary.error}</span>
          </div>
        ) : null}
      </TableCell>
      <TableCell className="py-3">
        <div className="flex flex-col gap-1">
          <CredentialStrategyBadge strategy={summary.credentialStrategy} />
          <CredentialSubStatus
            label={summary.credentialSubStatus.label}
            warning={summary.credentialSubStatus.warning}
          />
        </div>
      </TableCell>
      <TableCell className="py-3 font-mono text-xs text-muted-foreground">
        {summary.policySummary}
      </TableCell>
      <TableCell className="py-3 font-mono text-xs text-muted-foreground text-right">
        {summary.toolCount === null ? "—" : summary.toolCount}
      </TableCell>
      <TableCell className="py-3">
        <ConnectionStatusBadge state={summary.state} />
      </TableCell>
      <TableCell className="py-3 pr-[18px] text-right">
        <div className="flex justify-end">
          <RowActions
            summary={summary}
            onReconnect={onReconnect}
            onLink={onLink}
            isReconnecting={isReconnecting}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

import { Badge, Button, cn, TableCell, TableRow } from "@keidai/ui";
import type { ConnectionState } from "@keidai/shared";
import {
  ChevronRight,
  CircleAlert,
  Link2,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { ConnectorIcon } from "../lib/components/connector-icon.js";
import { useConnectionsPage } from "./context/use-connections-page.js";
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
    badgeClass: "border-transparent bg-destructive text-destructive-foreground",
  },
};

function ConnectionStatusBadge({ state }: { state: ConnectionState }) {
  const meta = connectionStateMeta[state];

  return (
    <Badge
      variant="outline"
      className={`
      gap-1.5
      ${meta.badgeClass}
    `}
    >
      {state === "connecting" ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : state === "connected" ? (
        <span
          className={`
          size-1.5 rounded-full
          ${meta.dotClass}
        `}
          aria-hidden
        />
      ) : null}
      {meta.label}
    </Badge>
  );
}

function RowActions({ summary }: { summary: ServerConnectionSummary }) {
  const { onLink } = useConnectionsPage();

  if (summary.rowAction === "link" && summary.linkProviderId) {
    return (
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          onLink(summary.linkProviderId!);
        }}
      >
        <Link2 className="size-3.5" aria-hidden />
        Link
      </Button>
    );
  }

  return null;
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
}: {
  summary: ServerConnectionSummary;
}) {
  const { onOpenServer } = useConnectionsPage();

  return (
    <TableRow
      className="
        cursor-pointer border-border
        hover:bg-muted/30
      "
      onClick={() => onOpenServer(summary.name)}
    >
      <TableCell className="py-3 pl-4.5 font-semibold">
        <span className="flex items-center gap-2.5">
          <ConnectorIcon
            slug={summary.icon ?? summary.name}
            label={summary.name}
            size="sm"
          />
          {summary.name}
        </span>
      </TableCell>
      <TableCell className="max-w-55 py-3">
        <div
          title={summary.endpoint}
          className="
          truncate font-mono text-xs text-muted-foreground
        "
        >
          {summary.endpoint}
        </div>
        {summary.state === "failed" && summary.error ? (
          <div
            className="
            mt-1 flex items-start gap-1.5 text-xs text-destructive
          "
          >
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
      <TableCell
        className="
        py-3 text-right font-mono text-xs text-muted-foreground
      "
      >
        {summary.toolCount === null ? "—" : summary.toolCount}
      </TableCell>
      <TableCell className="py-3">
        <ConnectionStatusBadge state={summary.state} />
      </TableCell>
      <TableCell className="w-0 py-3 pr-4.5 pl-2 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">
          <RowActions summary={summary} />
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground",
              summary.rowAction === "link" ? "" : "ml-0",
            )}
            aria-hidden
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

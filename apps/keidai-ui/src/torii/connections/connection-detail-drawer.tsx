import type { ServerToolView } from "@keidai/shared";
import { Badge, Button, cn } from "@keidai/ui";
import {
  Ban,
  Check,
  Link2,
  Loader2,
  RefreshCw,
  Server,
  TriangleAlert,
} from "lucide-react";
import {
  DetailDrawer,
  DetailDrawerSectionLabel,
} from "../../shell/components/detail-drawer/detail-drawer.js";
import { useFetchServerTools } from "../../shell/hooks/use-fetch-server-tools.js";
import { useConnectionsPage } from "./context/use-connections-page.js";
import { formatPolicySummary } from "./utils/format-policy-summary.js";

function ConnectionStatusBadge({
  state,
}: {
  state: "connected" | "connecting" | "failed";
}) {
  const meta =
    state === "connected"
      ? {
          label: "Connected",
          badgeClass:
            "border-transparent bg-secondary text-secondary-foreground",
          showDot: true,
        }
      : state === "connecting"
        ? {
            label: "Connecting",
            badgeClass: "border-border bg-background text-foreground",
            showDot: false,
          }
        : {
            label: "Failed",
            badgeClass:
              "border-transparent bg-destructive text-destructive-foreground",
            showDot: false,
          };

  return (
    <Badge variant="outline" className={cn("gap-1.5", meta.badgeClass)}>
      {state === "connecting" ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : meta.showDot ? (
        <span className="size-1.5 rounded-full bg-success" aria-hidden />
      ) : null}
      {meta.label}
    </Badge>
  );
}

function CredentialDetailRow({
  label,
  value,
  warning,
  destructive,
}: {
  label: string;
  value: string;
  warning?: boolean;
  destructive?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 text-[12.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "max-w-[300px] truncate text-right font-mono",
          warning && "text-warning",
          destructive && "text-destructive",
          !warning && !destructive && "text-foreground",
        )}
      >
        {warning || destructive ? (
          <span className="inline-flex items-center gap-1">
            <TriangleAlert className="size-3 shrink-0" aria-hidden />
            {value}
          </span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

function ToolsPlaceholder({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-3.5 py-6 text-center text-[12.5px] leading-snug text-muted-foreground">
      {message}
    </div>
  );
}

function ToolListItem({ tool }: { tool: ServerToolView }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
      <div className="min-w-0">
        <div className="font-mono text-[13px] font-semibold">{tool.name}</div>
        {tool.description ? (
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
            {tool.description}
          </p>
        ) : null}
      </div>
      <Badge
        variant={tool.allowed ? "secondary" : "outline"}
        className="shrink-0 gap-1 font-normal"
      >
        {tool.allowed ? (
          <Check className="size-[11px]" aria-hidden />
        ) : (
          <Ban className="size-[11px]" aria-hidden />
        )}
        {tool.allowed ? "Allowed" : "Blocked"}
      </Badge>
    </div>
  );
}

function ToolListGroup({
  label,
  tools,
}: {
  label: string;
  tools: ServerToolView[];
}) {
  if (tools.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className="flex flex-col gap-2">
        {tools.map((tool) => (
          <ToolListItem key={tool.name} tool={tool} />
        ))}
      </div>
    </div>
  );
}

function sortToolsByName(tools: readonly ServerToolView[]): ServerToolView[] {
  return [...tools].sort((left, right) => left.name.localeCompare(right.name));
}

export function ConnectionDetailDrawer() {
  const {
    selectedSummary: summary,
    selectedServer: server,
    drawerOpen: open,
    onDrawerOpenChange: onOpenChange,
    onReconnect,
    onLink,
    isServerReconnecting,
  } = useConnectionsPage();

  const { tools, isLoading: toolsLoading } = useFetchServerTools(
    summary?.name ?? null,
    open,
  );

  if (!summary || !server) {
    return null;
  }

  const isReconnecting = isServerReconnecting(summary.name);
  const policySummary = formatPolicySummary(server.policy);
  const allowedTools = server.policy.allow ?? [];
  const needsLink = summary.rowAction === "link" && summary.linkProviderId;
  const credentialSubStatus = summary.credentialSubStatus;
  const credentialDetailDestructive =
    credentialSubStatus.label === "provider misconfigured";

  const toolsUnavailableMessage =
    summary.state === "connecting"
      ? "Still connecting — the tool list will populate once the handshake completes."
      : summary.state === "failed"
        ? "Connection failed — reconnect the backend to load its tool list."
        : tools.length === 0 && !toolsLoading
          ? "No tools reported by this backend."
          : null;
  const allowedToolEntries = sortToolsByName(
    tools.filter((tool) => tool.allowed),
  );
  const blockedToolEntries = sortToolsByName(
    tools.filter((tool) => !tool.allowed),
  );

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      headerBadge={
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-secondary text-secondary-foreground">
          <Server className="size-4" aria-hidden />
        </span>
      }
      title={<span className="font-mono font-semibold">{summary.name}</span>}
      description={
        <div className="space-y-1.5">
          <div className="truncate font-mono text-[12.5px] text-muted-foreground">
            {summary.endpoint}
          </div>
          <ConnectionStatusBadge state={summary.state} />
        </div>
      }
      bodyClassName="space-y-[22px]"
      footerLeading={
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          disabled={isReconnecting}
          onClick={() => onReconnect(summary.name)}
        >
          <RefreshCw
            className={cn("size-3.5", isReconnecting && "animate-spin")}
            aria-hidden
          />
          Reconnect
        </Button>
      }
    >
      <div>
        <DetailDrawerSectionLabel>Credential</DetailDrawerSectionLabel>
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3.5 text-[12.5px]">
          <CredentialDetailRow
            label="strategy"
            value={summary.credentialStrategy}
          />
          <CredentialDetailRow
            label="detail"
            value={credentialSubStatus.label}
            warning={
              credentialSubStatus.warning && !credentialDetailDestructive
            }
            destructive={credentialDetailDestructive}
          />
        </div>
        {needsLink ? (
          <div className="mt-2.5 flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/8 p-3">
            <p className="flex-1 text-[12.5px] leading-snug text-foreground">
              Link your account so Torii can resolve credentials for this
              server.
            </p>
            <Button
              type="button"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => onLink(summary.linkProviderId!)}
            >
              <Link2 className="size-3.5" aria-hidden />
              Link
            </Button>
          </div>
        ) : null}
      </div>

      <div>
        <DetailDrawerSectionLabel>Policy</DetailDrawerSectionLabel>
        <div className="rounded-lg border border-border p-3.5">
          <p className="font-mono text-[12.5px] text-muted-foreground">
            {policySummary}
          </p>
          {allowedTools.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {allowedTools.map((toolName) => (
                <Badge
                  key={toolName}
                  variant="outline"
                  className="font-mono text-[11px] font-normal"
                >
                  {toolName}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-baseline justify-between">
          <DetailDrawerSectionLabel>Tools</DetailDrawerSectionLabel>
          <div className="font-mono text-[11.5px] text-muted-foreground">
            {summary.toolCount === null ? "—" : summary.toolCount}
          </div>
        </div>
        {toolsLoading ? (
          <ToolsPlaceholder message="Loading tools…" />
        ) : toolsUnavailableMessage ? (
          <ToolsPlaceholder message={toolsUnavailableMessage} />
        ) : (
          <div className="flex flex-col gap-4">
            <ToolListGroup label="Allowed" tools={allowedToolEntries} />
            <ToolListGroup label="Blocked" tools={blockedToolEntries} />
          </div>
        )}
      </div>
    </DetailDrawer>
  );
}

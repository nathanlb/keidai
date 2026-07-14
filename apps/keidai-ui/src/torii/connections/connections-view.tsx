import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@keidai/ui";
import { Cable, RefreshCw, Shield } from "lucide-react";
import { useConnectionsPage } from "./context/use-connections-page.js";
import { ConnectionDetailDrawer } from "./connection-detail-drawer.js";
import { ConnectionServerRow } from "./connection-server-row.js";
import { ConnectionsSummaryTiles } from "./connections-summary-tiles.js";
import { LinkingRequiredBanner } from "./linking-required-banner.js";

function PrivacyBanner() {
  return (
    <div className="mb-4 grid grid-cols-[auto_1fr] items-center gap-x-3 rounded-lg border border-border px-4 py-3 text-muted-foreground">
      <Shield className="size-4" aria-hidden />
      <p className="text-sm leading-snug">
        API keys, client secrets, and access tokens are never shown — only
        strategy, policy, and connection health.
      </p>
    </div>
  );
}

function ConnectionsEmptyState() {
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col items-center px-6 py-[60px] text-center">
        <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-muted/55 text-muted-foreground">
          <Cable className="size-[30px]" aria-hidden />
        </span>
        <div className="mt-4 text-base font-semibold">
          No servers configured
        </div>
        <p className="mt-1.5 max-w-[380px] text-[13px] leading-normal text-muted-foreground">
          Add MCP backends to <span className="font-mono">torii.yaml</span> to
          expose namespaced tools through the gateway.
        </p>
      </CardContent>
    </Card>
  );
}

export function ConnectionsView() {
  const {
    summaries,
    counts,
    isReconnectingAll,
    linkingRequiredTrace,
    linkingRequiredServer,
    onReconnectAll,
    onLinkFromBanner,
  } = useConnectionsPage();

  const isEmpty = summaries.length === 0;

  return (
    <>
      {isEmpty ? (
        <ConnectionsEmptyState />
      ) : (
        <div className="space-y-4">
          {linkingRequiredTrace ? (
            <LinkingRequiredBanner
              trace={linkingRequiredTrace}
              server={linkingRequiredServer}
              onLink={onLinkFromBanner}
            />
          ) : null}
          <ConnectionsSummaryTiles counts={counts} />

          <Card className="overflow-hidden shadow-none">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 px-[18px] py-4">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold">
                  Backend MCP servers
                </CardTitle>
                <CardDescription className="text-xs">
                  Only connected backends join tools/list fan-out. Credentials
                  resolve per call.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isReconnectingAll}
                onClick={onReconnectAll}
              >
                <RefreshCw
                  className={`size-3.5 ${isReconnectingAll ? "animate-spin" : ""}`}
                  aria-hidden
                />
                Reconnect all
              </Button>
            </CardHeader>

            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-auto py-2.5 pl-[18px] text-xs font-medium">
                      Server
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Endpoint
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Credential
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Policy
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium text-right">
                      Tools
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Status
                    </TableHead>
                    <TableHead className="h-auto w-0 whitespace-nowrap py-2.5 pr-[18px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((summary) => (
                    <ConnectionServerRow
                      key={summary.name}
                      summary={summary}
                      policyTooltip={summary.policyAllowTooltip}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
      <ConnectionDetailDrawer />
    </>
  );
}

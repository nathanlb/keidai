import { PageEmptyState } from "../../shell/components/page-content/page-empty-state.js";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
    <Alert className="mb-4">
      <Shield className="size-4" aria-hidden />
      <AlertTitle>Credentials stay private</AlertTitle>
      <AlertDescription>
        API keys, client secrets, and access tokens are never shown — only
        strategy, policy, and connection health.
      </AlertDescription>
    </Alert>
  );
}

function ConnectionsEmptyState() {
  return (
    <PageEmptyState
      icon={<Cable className="size-[30px]" aria-hidden />}
      title="No servers configured"
      description={
        <>
          Add MCP backends to <span className="font-mono">torii.yaml</span> to
          expose namespaced tools through the gateway.
        </>
      }
    />
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

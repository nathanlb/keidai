import { PageEmptyState } from "../shell/components/page-content/page-empty-state.js";
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
import { Cable, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useConnectionsPage } from "./context/use-connections-page.js";
import { AddConnectorDialog } from "./add-connector-dialog.js";
import { ConnectionDetailDrawer } from "./connection-detail-drawer.js";
import { ConnectionServerRow } from "./connection-server-row.js";
import { ConnectionsSummaryTiles } from "./connections-summary-tiles.js";
import { LinkingRequiredBanner } from "./linking-required-banner.js";

function ConnectionsEmptyState({
  onAdd,
}: {
  onAdd: () => void;
}) {
  return (
    <PageEmptyState
      icon={<Cable className="size-7.5" aria-hidden />}
      title="No connectors yet"
      description="Install a prebuilt MCP server from the catalog, or add a custom backend URL."
      action={
        <Button type="button" onClick={onAdd}>
          <Plus className="size-3.5" aria-hidden />
          Add connector
        </Button>
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
  const [addOpen, setAddOpen] = useState(false);

  const isEmpty = summaries.length === 0;

  return (
    <>
      {isEmpty ? (
        <ConnectionsEmptyState onAdd={() => setAddOpen(true)} />
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
            <CardHeader className="
              flex flex-row items-start justify-between space-y-0 px-4.5 py-4
            ">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold">
                  Connectors
                </CardTitle>
                <CardDescription className="text-xs">
                  MCP backends Torii fans out to. Add from the catalog or a
                  custom URL.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="size-3.5" aria-hidden />
                  Add connector
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isReconnectingAll}
                  onClick={onReconnectAll}
                >
                  <RefreshCw
                    className={`
                      size-3.5
                      ${isReconnectingAll ? "animate-spin" : ""}
                    `}
                    aria-hidden
                  />
                  Reconnect all
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="
                      h-auto py-2.5 pl-4.5 text-xs font-medium
                    ">
                      Server
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Endpoint
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Credential
                    </TableHead>
                    <TableHead className="
                      h-auto py-2.5 text-right text-xs font-medium
                    ">
                      Tools
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Status
                    </TableHead>
                    <TableHead className="
                      h-auto w-0 py-2.5 pr-4.5 whitespace-nowrap
                    " />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((summary) => (
                    <ConnectionServerRow
                      key={summary.name}
                      summary={summary}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
      <ConnectionDetailDrawer />
      <AddConnectorDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

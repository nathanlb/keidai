import { ConnectionsPageProvider } from "../context/connections-page-provider.js";
import { ConnectionsView } from "../connections-view.js";

export function ConnectionsPage() {
  return (
    <ConnectionsPageProvider>
      <ConnectionsView />
    </ConnectionsPageProvider>
  );
}

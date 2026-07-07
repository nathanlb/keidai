import { ConnectionsPageProvider } from "../connections/context/connections-page-provider.js";
import { ConnectionsView } from "../connections/connections-view.js";

export function ConnectionsPage() {
  return (
    <ConnectionsPageProvider>
      <ConnectionsView />
    </ConnectionsPageProvider>
  );
}

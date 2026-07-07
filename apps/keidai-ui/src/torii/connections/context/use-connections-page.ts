import { useContext } from "react";
import { ConnectionsPageContext } from "./connections-page-context.js";

export function useConnectionsPage() {
  const value = useContext(ConnectionsPageContext);
  if (!value) {
    throw new Error(
      "useConnectionsPage must be used within ConnectionsPageProvider",
    );
  }
  return value;
}

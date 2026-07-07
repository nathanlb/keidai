import { createBrowserRouter, Navigate } from "react-router-dom";
import { ToriiLayout } from "./torii/layout.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <ToriiLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/connections" replace />,
      },
      {
        path: "connections",
        lazy: async () => {
          const { ConnectionsPage } = await import(
            "./torii/pages/connections-page.js"
          );
          return { Component: ConnectionsPage };
        },
      },
      {
        path: "oauth-providers",
        lazy: async () => {
          const { OAuthProvidersPage } = await import(
            "./torii/pages/oauth-providers-page.js"
          );
          return { Component: OAuthProvidersPage };
        },
      },
      {
        path: "agents",
        lazy: async () => {
          const { AgentsOwnersPage } = await import(
            "./torii/pages/agents-owners-page.js"
          );
          return { Component: AgentsOwnersPage };
        },
      },
      {
        path: "activity",
        lazy: async () => {
          const { ActivityTracesPage } = await import(
            "./torii/pages/activity-traces-page.js"
          );
          return { Component: ActivityTracesPage };
        },
      },
    ],
  },
]);

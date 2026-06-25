import { createBrowserRouter, Navigate } from "react-router-dom";
import { ActivityTracesPage } from "./torii/pages/activity-traces-page.js";
import { AgentsOwnersPage } from "./torii/pages/agents-owners-page.js";
import { ConnectionsPage } from "./torii/pages/connections-page.js";
import { ToriiLayout } from "./torii/layout.js";
import { OAuthProvidersPage } from "./torii/pages/oauth-providers-page.js";

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
        element: <ConnectionsPage />,
      },
      {
        path: "oauth-providers",
        element: <OAuthProvidersPage />,
      },
      {
        path: "agents",
        element: <AgentsOwnersPage />,
      },
      {
        path: "activity",
        element: <ActivityTracesPage />,
      },
    ],
  },
]);

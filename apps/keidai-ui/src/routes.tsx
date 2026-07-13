import { createBrowserRouter, Navigate } from "react-router-dom";
import { KeidaiLayout } from "./shell/keidai-layout.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <KeidaiLayout />,
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
        path: "approvals",
        lazy: async () => {
          const { ApprovalsPage } = await import(
            "./torii/pages/approvals-page.js"
          );
          return { Component: ApprovalsPage };
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
      {
        path: "shaiden/tasks",
        lazy: async () => {
          const { TasksPage } = await import("./shaiden/pages/tasks-page.js");
          return { Component: TasksPage };
        },
      },
      {
        path: "shaiden/runs",
        lazy: async () => {
          const { RunsPage } = await import("./shaiden/pages/runs-page.js");
          return { Component: RunsPage };
        },
      },
    ],
  },
]);

import { createBrowserRouter, Navigate } from "react-router";
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
          const { AgentsPage } = await import("./fuda/pages/agents-page.js");
          return { Component: AgentsPage };
        },
      },
      {
        path: "agents/new",
        lazy: async () => {
          const { AgentCreatePage } = await import(
            "./fuda/pages/agent-create-page.js"
          );
          return { Component: AgentCreatePage };
        },
      },
      {
        path: "agents/:agentId",
        lazy: async () => {
          const { AgentDetailPage } = await import(
            "./fuda/pages/agent-detail-page.js"
          );
          return { Component: AgentDetailPage };
        },
      },
      {
        path: "bearers",
        lazy: async () => {
          const { BearersPage } = await import("./fuda/pages/bearers-page.js");
          return { Component: BearersPage };
        },
      },
      {
        path: "bearers/new",
        lazy: async () => {
          const { BearerCreatePage } = await import(
            "./fuda/pages/bearer-create-page.js"
          );
          return { Component: BearerCreatePage };
        },
      },
      {
        path: "bearers/:bearerId",
        lazy: async () => {
          const { BearerDetailPage } = await import(
            "./fuda/pages/bearer-detail-page.js"
          );
          return { Component: BearerDetailPage };
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

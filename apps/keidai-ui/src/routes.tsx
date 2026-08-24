import { createBrowserRouter, Navigate } from "react-router";
import { KeidaiLayout } from "./shell/keidai-layout.js";
import { PreserveSearchRedirect } from "./shell/components/preserve-search-redirect.js";
import {
  AGENTS_PATH,
  CONNECTIONS_PATH,
  HOME_PATH,
  PROVIDERS_PATH,
  RUNS_PATH,
  TASKS_PATH,
} from "./shell/navigation.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <KeidaiLayout />,
    children: [
      {
        index: true,
        element: <Navigate to={HOME_PATH} replace />,
      },
      {
        path: "home",
        lazy: async () => {
          const { HomePage } = await import("./shell/pages/home-page.js");
          return { Component: HomePage };
        },
      },
      {
        path: "connections",
        element: <PreserveSearchRedirect to={CONNECTIONS_PATH} />,
      },
      {
        path: "oauth-providers",
        element: <PreserveSearchRedirect to={PROVIDERS_PATH} />,
      },
      {
        path: "shaiden/tasks",
        element: <PreserveSearchRedirect to={TASKS_PATH} />,
      },
      {
        path: "shaiden/runs",
        element: <PreserveSearchRedirect to={RUNS_PATH} />,
      },
      {
        path: "configure",
        element: <PreserveSearchRedirect to={CONNECTIONS_PATH} />,
      },
      {
        path: "configure/connections",
        lazy: async () => {
          const { ConnectionsPage } =
            await import("./torii/pages/connections-page.js");
          return { Component: ConnectionsPage };
        },
      },
      {
        path: "configure/providers",
        lazy: async () => {
          const { OAuthProvidersPage } =
            await import("./torii/pages/oauth-providers-page.js");
          return { Component: OAuthProvidersPage };
        },
      },
      {
        path: "configure/groups",
        lazy: async () => {
          const { GroupsPage } = await import("./torii/pages/groups-page.js");
          return { Component: GroupsPage };
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
          const { AgentCreatePage } =
            await import("./fuda/pages/agent-create-page.js");
          return { Component: AgentCreatePage };
        },
      },
      {
        path: "agents/:agentId",
        lazy: async () => {
          const { AgentDetailPage } =
            await import("./fuda/pages/agent-detail-page.js");
          return { Component: AgentDetailPage };
        },
      },
      {
        path: "bearers",
        element: <Navigate to={AGENTS_PATH} replace />,
      },
      {
        path: "bearers/*",
        element: <Navigate to={AGENTS_PATH} replace />,
      },
      {
        path: "approvals",
        lazy: async () => {
          const { ApprovalsPage } =
            await import("./torii/pages/approvals-page.js");
          return { Component: ApprovalsPage };
        },
      },
      {
        path: "activity",
        lazy: async () => {
          const { ActivityTracesPage } =
            await import("./torii/pages/activity-traces-page.js");
          return { Component: ActivityTracesPage };
        },
      },
      {
        path: "tasks",
        lazy: async () => {
          const { TasksPage } = await import("./shaiden/pages/tasks-page.js");
          return { Component: TasksPage };
        },
      },
      {
        path: "tasks/:taskId",
        lazy: async () => {
          const { TasksPage } = await import("./shaiden/pages/tasks-page.js");
          return { Component: TasksPage };
        },
      },
      {
        path: "runs",
        lazy: async () => {
          const { RunsPage } = await import("./shaiden/pages/runs-page.js");
          return { Component: RunsPage };
        },
      },
      {
        path: "runs/:runId",
        lazy: async () => {
          const { RunsPage } = await import("./shaiden/pages/runs-page.js");
          return { Component: RunsPage };
        },
      },
    ],
  },
]);

import { createBrowserRouter, Navigate } from "react-router";
import { KeidaiLayout } from "./shell/keidai-layout.js";
import {
  PrefixRedirect,
  PreserveSearchRedirect,
} from "./shell/components/preserve-search-redirect.js";
import {
  AGENTS_PATH,
  CONNECTIONS_PATH,
  GROUPS_PATH,
  HOME_PATH,
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
          const { HomePage } = await import("./home/pages/home-page.js");
          return { Component: HomePage };
        },
      },
      {
        path: "oauth-providers",
        element: <PreserveSearchRedirect to={CONNECTIONS_PATH} />,
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
        path: "configure/groups",
        element: <PrefixRedirect from="/configure/groups" to={GROUPS_PATH} />,
      },
      {
        path: "configure/groups/*",
        element: <PrefixRedirect from="/configure/groups" to={GROUPS_PATH} />,
      },
      {
        path: "configure",
        element: <PreserveSearchRedirect to={CONNECTIONS_PATH} />,
      },
      {
        path: "connections",
        lazy: async () => {
          const { ConnectionsPage } =
            await import("./connections/pages/connections-page.js");
          return { Component: ConnectionsPage };
        },
      },
      {
        path: "configure/providers",
        element: <PreserveSearchRedirect to={CONNECTIONS_PATH} />,
      },
      {
        path: "groups",
        lazy: async () => {
          const { GroupsPage } = await import("./groups/pages/groups-page.js");
          return { Component: GroupsPage };
        },
      },
      {
        path: "groups/new",
        lazy: async () => {
          const { GroupCreatePage } =
            await import("./groups/pages/group-create-page.js");
          return { Component: GroupCreatePage };
        },
      },
      {
        path: "groups/:name",
        lazy: async () => {
          const { GroupDetailPage } =
            await import("./groups/pages/group-detail-page.js");
          return { Component: GroupDetailPage };
        },
      },
      {
        path: "agents",
        lazy: async () => {
          const { AgentsPage } = await import("./agents/pages/agents-page.js");
          return { Component: AgentsPage };
        },
      },
      {
        path: "agents/new",
        lazy: async () => {
          const { AgentCreatePage } =
            await import("./agents/pages/agent-create-page.js");
          return { Component: AgentCreatePage };
        },
      },
      {
        path: "agents/:agentId",
        lazy: async () => {
          const { AgentDetailPage } =
            await import("./agents/pages/agent-detail-page.js");
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
            await import("./approvals/pages/approvals-page.js");
          return { Component: ApprovalsPage };
        },
      },
      {
        path: "activity",
        lazy: async () => {
          const { ActivityTracesPage } =
            await import("./activity/pages/activity-traces-page.js");
          return { Component: ActivityTracesPage };
        },
      },
      {
        path: "tasks",
        lazy: async () => {
          const { TasksPage } = await import("./tasks/pages/tasks-page.js");
          return { Component: TasksPage };
        },
      },
      {
        path: "tasks/:taskId",
        lazy: async () => {
          const { TasksPage } = await import("./tasks/pages/tasks-page.js");
          return { Component: TasksPage };
        },
      },
      {
        path: "runs",
        lazy: async () => {
          const { RunsPage } = await import("./runs/pages/runs-page.js");
          return { Component: RunsPage };
        },
      },
      {
        path: "runs/:runId",
        lazy: async () => {
          const { RunsPage } = await import("./runs/pages/runs-page.js");
          return { Component: RunsPage };
        },
      },
    ],
  },
]);

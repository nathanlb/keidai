import { useLocation } from "react-router";
import { AppShell } from "./app-shell.js";
import { AppProvider } from "./context/app-provider.js";
import { OperatorAuthGate } from "./components/operator-auth-gate.js";
import { WorkspaceSidebarNav } from "./components/sidebar/workspace-sidebar-nav.js";
import {
  resolveAppNav,
  resolveAppNavSection,
  type AppNavSection,
} from "./navigation.js";
import { isFudaAgentsRoute } from "../agents/navigation.js";
import { OAuthLinkProvider } from "../oauth/context/oauth-link-provider.js";
import type { AppShellBreadcrumb } from "./types/index.js";

function buildBreadcrumb(
  pathname: string,
  navSection: AppNavSection | undefined,
  current: ReturnType<typeof resolveAppNav>,
): AppShellBreadcrumb {
  const section = navSection?.label ?? "";

  if (current) {
    return {
      section,
      page: current.label,
    };
  }

  const fallback = pathname.split("/").filter(Boolean)[0] ?? "Keidai";
  return { section, page: fallback };
}

export function KeidaiLayout() {
  const { pathname } = useLocation();
  const current = resolveAppNav(pathname);
  const navSection = resolveAppNavSection(pathname);
  const onFudaAgentsRoute = isFudaAgentsRoute(pathname);
  const suppressHeader =
    onFudaAgentsRoute || !current || current.suppressPageHeader;

  return (
    <AppProvider>
      <OperatorAuthGate>
        <OAuthLinkProvider>
          <AppShell
            breadcrumb={buildBreadcrumb(pathname, navSection, current)}
            pageHeader={
              suppressHeader || !current
                ? undefined
                : {
                    title: current.title,
                    description: current.description,
                    configChip: current.configChip,
                    showRefresh: current.showRefresh,
                  }
            }
            sidebarNav={<WorkspaceSidebarNav />}
            sidebarSubtitle="Agent Ecosystem"
          />
        </OAuthLinkProvider>
      </OperatorAuthGate>
    </AppProvider>
  );
}

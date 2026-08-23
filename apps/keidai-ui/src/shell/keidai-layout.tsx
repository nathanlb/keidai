import { useLocation } from "react-router";
import { AppShell } from "./app-shell.js";
import { AppProvider } from "./context/app-provider.js";
import { OperatorAuthGate } from "./components/operator-auth-gate.js";
import { PlatformSidebarNav } from "./components/sidebar/platform-sidebar-nav.js";
import { resolveAppNav, resolveAppSection } from "./navigation.js";
import { isFudaManagedRoute } from "../fuda/navigation.js";
import { OAuthLinkProvider } from "../torii/oauth/context/oauth-link-provider.js";
import type { AppShellBreadcrumb } from "./types/index.js";

function buildBreadcrumb(
  pathname: string,
  section: string,
  current: ReturnType<typeof resolveAppNav>,
): AppShellBreadcrumb {
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
  const section = resolveAppSection(pathname);
  const onFudaManagedRoute = isFudaManagedRoute(pathname);
  const suppressHeader =
    onFudaManagedRoute || !current || current.suppressPageHeader;

  return (
    <AppProvider>
      <OperatorAuthGate>
        <OAuthLinkProvider>
          <AppShell
            breadcrumb={buildBreadcrumb(pathname, section, current)}
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
            sidebarNav={<PlatformSidebarNav />}
            sidebarSubtitle="ecosystem console"
          />
        </OAuthLinkProvider>
      </OperatorAuthGate>
    </AppProvider>
  );
}

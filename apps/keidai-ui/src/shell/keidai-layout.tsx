import { useLocation } from "react-router-dom";
import { AppShell } from "./app-shell.js";
import { AppProvider } from "./context/app-provider.js";
import { PlatformSidebarNav } from "./components/sidebar/platform-sidebar-nav.js";
import { resolveAppNav, resolveAppSection } from "./resolve-app-nav.js";
import { OAuthLinkProvider } from "../torii/oauth/context/oauth-link-provider.js";
import type { AppShellBreadcrumb } from "./types/index.js";

function buildBreadcrumb(
  section: string,
  current: NonNullable<ReturnType<typeof resolveAppNav>>,
): AppShellBreadcrumb {
  if ("breadcrumb" in current && current.breadcrumb) {
    const segments = current.breadcrumb;
    return {
      section,
      page: segments.at(-1)?.label ?? current.label,
      segments,
    };
  }

  return {
    section,
    page: current.label,
  };
}

export function KeidaiLayout() {
  const { pathname } = useLocation();
  const current = resolveAppNav(pathname);
  const section = resolveAppSection(pathname);

  return (
    <AppProvider>
      <OAuthLinkProvider>
        <AppShell
          breadcrumb={
            current
              ? buildBreadcrumb(section, current)
              : { section, page: section }
          }
          pageHeader={
            current
              ? {
                  title: current.title,
                  description: current.description,
                  configChip: section === "Torii" ? "torii.yaml" : undefined,
                  showRefresh:
                    "showRefresh" in current ? current.showRefresh : undefined,
                }
              : undefined
          }
          sidebarNav={<PlatformSidebarNav />}
          sidebarSubtitle="Agent ecosystem"
        />
      </OAuthLinkProvider>
    </AppProvider>
  );
}

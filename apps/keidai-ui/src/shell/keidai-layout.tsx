import { useLocation } from "react-router-dom";
import { AppShell } from "./app-shell.js";
import { AppProvider } from "./context/app-provider.js";
import { PlatformSidebarNav } from "./components/sidebar/platform-sidebar-nav.js";
import { resolveAppNav, resolveAppSection } from "./resolve-app-nav.js";
import { OAuthLinkProvider } from "../torii/oauth/context/oauth-link-provider.js";

export function KeidaiLayout() {
  const { pathname } = useLocation();
  const current = resolveAppNav(pathname);
  const section = resolveAppSection(pathname);

  return (
    <AppProvider>
      <OAuthLinkProvider>
        <AppShell
          breadcrumb={{
            section,
            page: current?.label ?? section,
          }}
          pageHeader={
            current
              ? {
                  title: current.title,
                  description: current.description,
                  configChip:
                    section === "Torii" ? "torii.yaml" : undefined,
                }
              : undefined
          }
          sidebarNav={<PlatformSidebarNav />}
          sidebarSubtitle="Agent platform"
        />
      </OAuthLinkProvider>
    </AppProvider>
  );
}

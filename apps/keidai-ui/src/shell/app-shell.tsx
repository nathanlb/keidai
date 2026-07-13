import { Suspense, useCallback, useEffect, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { useSWRConfig } from "swr";
import { cn } from "@keidai/ui";
import { refreshToriiConfig } from "./hooks/refresh-torii-config.js";
import { useShellDesktop } from "./hooks/use-media-query.js";
import { useShellUi } from "./hooks/use-shell-ui.js";
import { useTheme } from "./hooks/use-theme.js";
import { PageHeader } from "./components/page-content/page-header.js";
import { Sidebar } from "./components/sidebar/sidebar.js";
import { SidebarDrawer } from "./components/sidebar/sidebar-drawer.js";
import { TopBar } from "./components/top-bar/top-bar.js";
import type { AppShellBreadcrumb, AppShellPageHeader } from "./types/index.js";

export interface AppShellProps {
  breadcrumb: AppShellBreadcrumb;
  pageHeader?: AppShellPageHeader;
  sidebarNav: ReactNode;
  sidebarSubtitle?: string;
  onRefresh?: () => void;
}

export function AppShell({
  breadcrumb,
  pageHeader,
  sidebarNav,
  sidebarSubtitle,
  onRefresh,
}: AppShellProps) {
  const { theme } = useTheme();
  const { navOpen, setNavOpen } = useShellUi();
  const { mutate } = useSWRConfig();
  const isDesktop = useShellDesktop();

  useEffect(() => {
    if (isDesktop) {
      setNavOpen(false);
    }
  }, [isDesktop, setNavOpen]);

  const refresh = useCallback(() => {
    refreshToriiConfig(mutate);
    onRefresh?.();
  }, [mutate, onRefresh]);

  const sidebarPanelProps = {
    subtitle: sidebarSubtitle,
    children: sidebarNav,
  };

  return (
    <div
      className={cn(
        "bg-neutral-950 selection:bg-primary/30",
        theme === "dark" && "dark",
      )}
    >
      <div className="flex h-screen overflow-hidden bg-background font-sans text-sm text-foreground">
        <Sidebar {...sidebarPanelProps} />

        {!isDesktop ? (
          <SidebarDrawer
            {...sidebarPanelProps}
            open={navOpen}
            onOpenChange={setNavOpen}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar breadcrumb={breadcrumb} showNavButton={!isDesktop} />

          <div className="flex-1 overflow-y-auto px-5 pb-10 pt-6 md:px-7 md:pb-[60px] md:pt-6">
            <div className="mx-auto max-w-[1080px]">
              {pageHeader ? (
                <PageHeader page={pageHeader} onRefresh={refresh} />
              ) : null}
              <Suspense fallback={null}>
                <Outlet />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

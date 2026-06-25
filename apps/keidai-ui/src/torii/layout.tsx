import { useLocation } from "react-router-dom";
import { AppShell } from "../shell/app-shell.js";
import { AppProvider } from "../shell/context/app-provider.js";
import { findToriiNavItem } from "./navigation.js";
import { ToriiSidebarNav } from "./sidebar-nav.js";

export function ToriiLayout() {
  const { pathname } = useLocation();
  const current = findToriiNavItem(pathname);

  return (
    <AppProvider>
      <AppShell
        breadcrumb={{
          section: "Torii",
          page: current?.label ?? "Torii",
        }}
        pageHeader={
          current
            ? {
                title: current.title,
                description: current.description,
                configChip: "torii.yaml",
              }
            : undefined
        }
        sidebarNav={<ToriiSidebarNav />}
      />
    </AppProvider>
  );
}

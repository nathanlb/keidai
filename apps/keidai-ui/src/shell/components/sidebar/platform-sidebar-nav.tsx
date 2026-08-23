import { useLocation } from "react-router";
import { resolveNavMode } from "../../navigation.js";
import { ConfigureSidebarNav } from "./configure-sidebar-nav.js";
import { WorkspaceSidebarNav } from "./workspace-sidebar-nav.js";

export function PlatformSidebarNav() {
  const { pathname } = useLocation();
  return resolveNavMode(pathname) === "configure" ? (
    <ConfigureSidebarNav />
  ) : (
    <WorkspaceSidebarNav />
  );
}

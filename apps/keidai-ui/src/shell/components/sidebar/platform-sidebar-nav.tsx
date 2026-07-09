import { ToriiSidebarNav } from "../../../torii/sidebar-nav.js";
import { ShaidenSidebarNav } from "../../../shaiden/sidebar-nav.js";

export function PlatformSidebarNav() {
  return (
    <>
      <ToriiSidebarNav />
      <ShaidenSidebarNav />
    </>
  );
}

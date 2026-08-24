import type { MouseEvent, ReactNode } from "react";
import { useLocation } from "react-router";
import { KeidaiLogo } from "../logo/keidai-logo.js";
import { resolveNavMode } from "../../navigation.js";
import { BackendHealthFooter } from "./backend-health-footer.js";
import { ConfigureDoor } from "./configure-door.js";

export interface SidebarPanelProps {
  subtitle?: string;
  children: ReactNode;
  onNavInteract?: (event: MouseEvent<HTMLElement>) => void;
}

export function SidebarPanel({
  subtitle = "ecosystem console",
  children,
  onNavInteract,
}: SidebarPanelProps) {
  const { pathname } = useLocation();
  const mode = resolveNavMode(pathname);

  return (
    <>
      <div className="box-border flex h-[58px] shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3.5">
        <KeidaiLogo
          size={30}
          title=""
          className="size-[30px] shrink-0 rounded-lg"
        />
        <div className="min-w-0 leading-tight">
          <div className="text-[13.5px] font-semibold text-sidebar-foreground">
            keidai
          </div>
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
      </div>

      <div
        data-testid="sidebar-nav"
        className="flex flex-1 flex-col gap-px overflow-y-auto p-2 pt-2.5"
        onClick={onNavInteract}
      >
        {children}
      </div>

      <div onClick={onNavInteract}>
        {mode === "configure" ? <BackendHealthFooter /> : <ConfigureDoor />}
      </div>
    </>
  );
}

interface SidebarProps extends SidebarPanelProps {}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="hidden w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <SidebarPanel {...props} />
    </aside>
  );
}

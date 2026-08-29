import type { MouseEvent, ReactNode } from "react";
import { KeidaiLogo } from "../logo/keidai-logo.js";
import { BackendHealthFooter } from "./backend-health-footer.js";

export interface SidebarPanelProps {
  subtitle?: string;
  children: ReactNode;
  onNavInteract?: (event: MouseEvent<HTMLElement>) => void;
}

export function SidebarPanel({
  subtitle,
  children,
  onNavInteract,
}: SidebarPanelProps) {
  return (
    <>
      <div
        className="
        box-border flex h-14.5 shrink-0 items-center gap-2.5 border-b
        border-sidebar-border px-3.5
      "
      >
        <KeidaiLogo size={28} title="" className="shrink-0" />
        <div className="min-w-0 leading-tight">
          <div className="text-[13.5px] font-semibold text-sidebar-foreground">
            Keidai
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
        <BackendHealthFooter />
      </div>
    </>
  );
}

type SidebarProps = SidebarPanelProps;

export function Sidebar(props: SidebarProps) {
  return (
    <aside
      className="
      hidden w-62 shrink-0 flex-col border-r border-sidebar-border bg-sidebar
      md:flex
    "
    >
      <SidebarPanel {...props} />
    </aside>
  );
}

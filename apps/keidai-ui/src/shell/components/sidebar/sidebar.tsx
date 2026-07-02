import { ChevronsUpDown } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { GatewayHealthFooter } from "./gateway-health-footer.js";

export interface SidebarPanelProps {
  subtitle?: string;
  children: ReactNode;
  onNavInteract?: (event: MouseEvent<HTMLElement>) => void;
}

export function SidebarPanel({
  subtitle = "Torii gateway",
  children,
  onNavInteract,
}: SidebarPanelProps) {
  return (
    <>
      <div className="box-border flex h-[58px] shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3.5">
        <div className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-[15px] font-bold text-sidebar-primary-foreground">
          鳥
        </div>
        <div className="min-w-0 leading-tight">
          <div className="text-[13.5px] font-semibold text-sidebar-foreground">
            Keidai
          </div>
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
      </div>

      <div
        className="flex flex-1 flex-col gap-px overflow-y-auto p-2 pt-2.5"
        onClick={onNavInteract}
      >
        {children}
      </div>

      <GatewayHealthFooter />
    </>
  );
}

interface SidebarProps extends SidebarPanelProps { }

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="hidden w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <SidebarPanel {...props} />
    </aside>
  );
}

import type { MouseEvent, ReactNode } from "react";
import { KeidaiLogo } from "../logo/keidai-logo.js";
import { useEcosystemHealth } from "../../../lib/hooks/use-ecosystem-health.js";

export interface SidebarPanelProps {
  subtitle?: string;
  children: ReactNode;
  onNavInteract?: (event: MouseEvent<HTMLElement>) => void;
}

export function SidebarPanel({
  subtitle = "Agent Ecosystem",
  children,
  onNavInteract,
}: SidebarPanelProps) {
  const { version } = useEcosystemHealth();

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
          <div
            className="truncate font-mono text-[11px] text-muted-foreground"
            data-testid="sidebar-ecosystem-version"
          >
            {version || subtitle}
          </div>
        </div>
      </div>

      <div
        data-testid="sidebar-nav"
        className="flex flex-1 flex-col gap-px overflow-y-auto p-2 pt-2.5"
        onClick={onNavInteract}
      >
        {children}
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

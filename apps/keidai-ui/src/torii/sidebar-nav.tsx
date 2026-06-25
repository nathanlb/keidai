import { cn } from "@keidai/ui";
import { Bot, FolderKanban } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useGatewayStatus } from "../shell/hooks/use-gateway-status.js";
import { toriiNavItems } from "./navigation.js";

const navItemClassName =
  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-foreground no-underline transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

function NavIcon({ children }: { children: ReactNode }) {
  return <span className="inline-flex shrink-0">{children}</span>;
}

function NavLabel({
  children,
  spaced = false,
}: {
  children: ReactNode;
  spaced?: boolean;
}) {
  return (
    <div
      className={cn(
        "px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase",
        spaced ? "flex items-center gap-1.5 pt-3.5" : "pt-2.5",
      )}
    >
      {children}
    </div>
  );
}

export function ToriiSidebarNav() {
  const { status } = useGatewayStatus();

  return (
    <>

      <NavLabel spaced>
        Torii
        <span
          className={cn(
            "inline-block size-1.5 rounded-full",
            status.healthy ? "bg-success" : "bg-destructive",
          )}
          aria-hidden
        />
      </NavLabel>

      {toriiNavItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            cn(
              navItemClassName,
              isActive &&
                "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
            )
          }
        >
          <NavIcon>
            <item.icon className="size-4" />
          </NavIcon>
          {item.label}
        </NavLink>
      ))}
    </>
  );
}

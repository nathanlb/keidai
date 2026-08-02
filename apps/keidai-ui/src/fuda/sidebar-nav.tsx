import { cn } from "@keidai/ui";
import { NavLink, useLocation } from "react-router-dom";
import { useFudaStatus } from "../shell/hooks/use-fuda-status.js";
import {
  NavIcon,
  NavLabel,
  navItemClassName,
  sidebarNavLinkTestId,
} from "../shell/components/sidebar/nav-primitives.js";
import { AGENTS_PATH, fudaNavItems, isFudaAgentsRoute } from "./navigation.js";

export function FudaSidebarNav() {
  const { status } = useFudaStatus();
  const { pathname } = useLocation();

  return (
    <>
      <NavLabel spaced section="fuda">
        Fuda
        <span
          className={cn(
            "inline-block size-1.5 rounded-full",
            status.healthy ? "bg-success" : "bg-destructive",
          )}
          aria-hidden
        />
      </NavLabel>

      {fudaNavItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          data-testid={sidebarNavLinkTestId(item.path)}
          className={({ isActive }) =>
            cn(
              navItemClassName,
              (isActive ||
                (item.path === AGENTS_PATH && isFudaAgentsRoute(pathname))) &&
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

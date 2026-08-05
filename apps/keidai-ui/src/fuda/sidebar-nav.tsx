import { cn } from "@keidai/ui";
import { NavLink, useLocation } from "react-router";
import { useFetchAgents } from "../shell/hooks/use-fetch-agents.js";
import { useFudaStatus } from "../shell/hooks/use-fuda-status.js";
import {
  NavIcon,
  NavLabel,
  navItemClassName,
  sidebarNavLinkTestId,
} from "../shell/components/sidebar/nav-primitives.js";
import {
  AGENTS_PATH,
  BEARERS_PATH,
  fudaNavItems,
  isFudaAgentsRoute,
  isFudaBearersRoute,
} from "./navigation.js";

function NavCount({ count }: { count: number | undefined }) {
  if (count === undefined) {
    return null;
  }

  return (
    <span className="ml-auto font-mono text-[11px] text-muted-foreground">
      {count}
    </span>
  );
}

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
                (item.path === AGENTS_PATH && isFudaAgentsRoute(pathname)) ||
                (item.path === BEARERS_PATH && isFudaBearersRoute(pathname))) &&
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

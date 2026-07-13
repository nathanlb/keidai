import { cn } from "@keidai/ui";
import { NavLink } from "react-router-dom";
import { useToriiStatus } from "../shell/hooks/use-torii-status.js";
import { usePendingApprovalsCount } from "../shell/hooks/use-approvals.js";
import {
  NavIcon,
  NavLabel,
  navItemClassName,
  sidebarNavLinkTestId,
} from "../shell/components/sidebar/nav-primitives.js";
import { NavPendingBadge } from "../shell/components/sidebar/approvals-pending-footer.js";
import { toriiNavItems } from "./navigation.js";

export function ToriiSidebarNav() {
  const { status } = useToriiStatus();
  const pendingCount = usePendingApprovalsCount();

  return (
    <>
      <NavLabel spaced section="torii">
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
          data-testid={sidebarNavLinkTestId(item.path)}
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
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {item.label}
            {item.path === "/approvals" ? (
              <NavPendingBadge count={pendingCount} />
            ) : null}
          </span>
        </NavLink>
      ))}
    </>
  );
}

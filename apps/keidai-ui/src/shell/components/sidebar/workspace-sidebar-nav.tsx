import { cn } from "@keidai/ui";
import { NavLink, useLocation } from "react-router";
import { usePendingApprovalsCount } from "../../hooks/use-approvals.js";
import {
  homeNavItem,
  isNavItemActive,
  operateNavItems,
  APPROVALS_PATH,
} from "../../navigation.js";
import { NavPendingBadge } from "./approvals-pending-footer.js";
import {
  NavIcon,
  NavLabel,
  navItemClassName,
  sidebarNavLinkTestId,
} from "./nav-primitives.js";

export function WorkspaceSidebarNav() {
  const { pathname } = useLocation();
  const pendingCount = usePendingApprovalsCount();

  return (
    <>
      <NavLink
        to={homeNavItem.path}
        end
        data-testid={sidebarNavLinkTestId(homeNavItem.path)}
        className={({ isActive }) =>
          cn(
            navItemClassName,
            isActive &&
              "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
          )
        }
      >
        <NavIcon>
          <homeNavItem.icon className="size-4" />
        </NavIcon>
        {homeNavItem.label}
      </NavLink>

      <NavLabel spaced section="operate">
        Operate
      </NavLabel>

      {operateNavItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          data-testid={sidebarNavLinkTestId(item.path)}
          className={() =>
            cn(
              navItemClassName,
              isNavItemActive(item, pathname) &&
                "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
            )
          }
        >
          <NavIcon>
            <item.icon className="size-4" />
          </NavIcon>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {item.label}
            {item.path === APPROVALS_PATH ? (
              <NavPendingBadge count={pendingCount} />
            ) : null}
          </span>
        </NavLink>
      ))}
    </>
  );
}

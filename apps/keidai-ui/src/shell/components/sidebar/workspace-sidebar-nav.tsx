import { cn } from "@keidai/ui";
import { Fragment } from "react";
import { NavLink, useLocation } from "react-router";
import { usePendingApprovalsCount } from "../../hooks/use-approvals.js";
import {
  homeNavItem,
  isNavItemActive,
  workspaceNavSections,
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

      {workspaceNavSections.map((section) => (
        <Fragment key={section.id}>
          <NavLabel spaced section={section.id}>
            {section.label}
          </NavLabel>

          {section.items.map((item) => (
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
              {item.path === APPROVALS_PATH ? (
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {item.label}
                  <NavPendingBadge count={pendingCount} />
                </span>
              ) : (
                item.label
              )}
            </NavLink>
          ))}
        </Fragment>
      ))}
    </>
  );
}

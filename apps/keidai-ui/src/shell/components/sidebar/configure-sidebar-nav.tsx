import { cn } from "@keidai/ui";
import { ChevronLeft } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router";
import {
  configureNavSection,
  HOME_PATH,
  isNavItemActive,
} from "../../navigation.js";
import {
  NavIcon,
  NavLabel,
  navItemClassName,
  sidebarNavLinkTestId,
} from "./nav-primitives.js";

export function ConfigureSidebarNav() {
  const { pathname } = useLocation();

  return (
    <>
      <Link
        to={HOME_PATH}
        data-testid="sidebar-configure-back"
        className={cn(
          navItemClassName,
          "mb-1.5 text-[12.5px] font-normal text-muted-foreground hover:text-sidebar-accent-foreground",
        )}
      >
        <ChevronLeft className="size-3.5 shrink-0" aria-hidden />
        Back
      </Link>

      <NavLabel section={configureNavSection.id}>
        {configureNavSection.label}
      </NavLabel>

      {configureNavSection.items.map((item) => (
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
          {item.label}
        </NavLink>
      ))}
    </>
  );
}

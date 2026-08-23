import { cn } from "@keidai/ui";
import { ChevronLeft } from "lucide-react";
import { Link, NavLink, useLocation, useSearchParams } from "react-router";
import { useLastWorkspacePath } from "../../hooks/use-last-workspace-path.js";
import { configureNavItems, isNavItemActive } from "../../navigation.js";
import { parseConfigureDeepLink } from "../../utils/configure-deep-link.js";
import {
  NavIcon,
  NavLabel,
  navItemClassName,
  sidebarNavLinkTestId,
} from "./nav-primitives.js";

export function ConfigureSidebarNav() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const lastWorkspacePath = useLastWorkspacePath();
  const { returnTo } = parseConfigureDeepLink(searchParams);
  const backTo = returnTo ?? lastWorkspacePath;

  return (
    <>
      <Link
        to={backTo}
        data-testid="sidebar-configure-back"
        className={cn(
          navItemClassName,
          "mb-1.5 text-[12.5px] font-normal text-muted-foreground hover:text-sidebar-accent-foreground",
        )}
      >
        <ChevronLeft className="size-3.5 shrink-0" aria-hidden />
        Back
      </Link>

      <NavLabel section="configure">Configure</NavLabel>

      {configureNavItems.map((item) => {
        const search = searchParams.toString();
        return (
          <NavLink
            key={item.path}
            to={{ pathname: item.path, search: search ? `?${search}` : "" }}
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
        );
      })}
    </>
  );
}

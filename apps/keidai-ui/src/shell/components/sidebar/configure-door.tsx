import { ChevronRight, Settings } from "lucide-react";
import { Link, useLocation } from "react-router";
import { buildConfigureHref } from "../../utils/configure-deep-link.js";
import { navItemClassName, NavIcon } from "./nav-primitives.js";

export function ConfigureDoor() {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;

  return (
    <div className="border-t border-sidebar-border p-2">
      <Link
        to={buildConfigureHref({ returnTo })}
        data-testid="sidebar-configure-door"
        className={navItemClassName}
      >
        <NavIcon>
          <Settings className="size-4" />
        </NavIcon>
        Configure
        <ChevronRight
          className="ml-auto size-3.5 text-muted-foreground"
          aria-hidden
        />
      </Link>
    </div>
  );
}

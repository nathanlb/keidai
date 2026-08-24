import { ChevronRight, Settings } from "lucide-react";
import { Link } from "react-router";
import { CONNECTIONS_PATH } from "../../navigation.js";
import { navItemClassName, NavIcon } from "./nav-primitives.js";

export function ConfigureDoor() {
  return (
    <div className="border-t border-sidebar-border p-2">
      <Link
        to={CONNECTIONS_PATH}
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

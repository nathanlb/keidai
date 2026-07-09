import { cn } from "@keidai/ui";
import { NavLink } from "react-router-dom";
import { useGatewayStatus } from "../shell/hooks/use-gateway-status.js";
import {
  NavIcon,
  NavLabel,
  navItemClassName,
} from "../shell/components/sidebar/nav-primitives.js";
import { toriiNavItems } from "./navigation.js";

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

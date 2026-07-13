import { cn } from "@keidai/ui";
import { NavLink } from "react-router-dom";
import { useShaidenStatus } from "../shell/hooks/use-shaiden-status.js";
import {
  NavIcon,
  NavLabel,
  navItemClassName,
} from "../shell/components/sidebar/nav-primitives.js";
import { shaidenNavItems } from "./navigation.js";

export function ShaidenSidebarNav() {
  const { status } = useShaidenStatus();

  return (
    <>
      <NavLabel spaced>
        Shaiden
        <span
          className={cn(
            "inline-block size-1.5 rounded-full",
            status.healthy ? "bg-success" : "bg-destructive",
          )}
          aria-hidden
        />
      </NavLabel>

      {shaidenNavItems.map((item) => (
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

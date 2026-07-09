import { cn } from "@keidai/ui";
import type { ReactNode } from "react";

export const navItemClassName =
  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-foreground no-underline transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export function NavIcon({ children }: { children: ReactNode }) {
  return <span className="inline-flex shrink-0">{children}</span>;
}

export function NavLabel({
  children,
  spaced = false,
}: {
  children: ReactNode;
  spaced?: boolean;
}) {
  return (
    <div
      className={cn(
        "px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase",
        spaced ? "flex items-center gap-1.5 pt-3.5" : "pt-2.5",
      )}
    >
      {children}
    </div>
  );
}

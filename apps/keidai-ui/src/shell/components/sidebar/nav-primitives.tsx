import { cn } from "@keidai/ui";
import type { ReactNode } from "react";

export const navItemClassName =
  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-foreground no-underline transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export function sidebarNavLinkTestId(path: string): string {
  const slug = path.replace(/^\//, "").replace(/\//g, "-");
  return `sidebar-nav-link-${slug}`;
}

export function NavIcon({ children }: { children: ReactNode }) {
  return <span className="inline-flex shrink-0">{children}</span>;
}

export function NavLabel({
  children,
  spaced = false,
  section,
}: {
  children: ReactNode;
  spaced?: boolean;
  section?: string;
}) {
  return (
    <div
      data-testid={section ? `sidebar-nav-section-${section}` : undefined}
      className={cn(
        "px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase",
        spaced ? "flex items-center gap-1.5 pt-3.5" : "pt-2.5",
      )}
    >
      {children}
    </div>
  );
}

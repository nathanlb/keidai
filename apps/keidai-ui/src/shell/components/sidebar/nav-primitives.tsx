import { cn } from "@keidai/ui";
import type { ReactNode } from "react";

export const navItemClassName =
  "flex items-center gap-[9px] rounded-[6px] px-2 py-[7px] text-[13.5px] font-medium text-sidebar-foreground no-underline transition-[background,color] duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground motion-reduce:transition-none";

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
        `
          px-2 pb-1 text-[11px] font-semibold tracking-[0.06em]
          text-muted-foreground uppercase
        `,
        spaced ? "pt-3.5" : "pt-1",
      )}
    >
      {children}
    </div>
  );
}

import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { AppShellBreadcrumb } from "../../types/index.js";

interface BreadcrumbProps {
  breadcrumb: AppShellBreadcrumb;
}

export function Breadcrumb({ breadcrumb }: BreadcrumbProps) {
  const trail =
    breadcrumb.segments && breadcrumb.segments.length > 0
      ? breadcrumb.segments
      : [{ label: breadcrumb.page }];

  return (
    <div className="flex min-w-0 items-center gap-2 text-[13.5px] text-muted-foreground">
      <span>{breadcrumb.section}</span>
      {trail.map((segment, index) => {
        const isLast = index === trail.length - 1;
        return (
          <span key={`${segment.label}-${index}`} className="contents">
            <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            {segment.href && !isLast ? (
              <Link
                to={segment.href}
                className="truncate rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {segment.label}
              </Link>
            ) : (
              <span
                className={
                  isLast ? "truncate text-foreground" : "truncate"
                }
              >
                {segment.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

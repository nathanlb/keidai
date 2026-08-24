import {
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@keidai/ui";
import { Link } from "react-router";
import type { AppShellBreadcrumb } from "../../types/index.js";

interface BreadcrumbProps {
  breadcrumb: AppShellBreadcrumb;
}

export function Breadcrumb({ breadcrumb }: BreadcrumbProps) {
  const trail =
    breadcrumb.segments && breadcrumb.segments.length > 0
      ? breadcrumb.segments
      : [{ label: breadcrumb.page }];
  const hasSection = Boolean(breadcrumb.section);

  return (
    <BreadcrumbRoot className="min-w-0 text-[13.5px]">
      <BreadcrumbList>
        {hasSection ? (
          <BreadcrumbItem className="text-muted-foreground">
            {breadcrumb.section}
          </BreadcrumbItem>
        ) : null}
        {trail.map((segment, index) => {
          const isLast = index === trail.length - 1;
          const showSeparator = hasSection || index > 0;
          return (
            <span key={`${segment.label}-${index}`} className="contents">
              {showSeparator ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem className="min-w-0">
                {isLast ? (
                  <BreadcrumbPage className="truncate">
                    {segment.label}
                  </BreadcrumbPage>
                ) : segment.href ? (
                  <BreadcrumbLink asChild>
                    <Link
                      to={segment.href}
                      className="truncate rounded-md px-1.5 py-0.5 hover:bg-accent hover:text-accent-foreground"
                    >
                      {segment.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <span className="truncate">{segment.label}</span>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}
      </BreadcrumbList>
    </BreadcrumbRoot>
  );
}

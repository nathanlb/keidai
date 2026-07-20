import {
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@keidai/ui";
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
    <BreadcrumbRoot className="min-w-0 text-[13.5px]">
      <BreadcrumbList>
        <BreadcrumbItem className="text-muted-foreground">
          {breadcrumb.section}
        </BreadcrumbItem>
        {trail.map((segment, index) => {
          const isLast = index === trail.length - 1;
          return (
            <span key={`${segment.label}-${index}`} className="contents">
              <BreadcrumbSeparator />
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

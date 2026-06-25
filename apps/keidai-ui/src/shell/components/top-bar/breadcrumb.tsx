import { ChevronRight } from "lucide-react";
import { AppShellBreadcrumb } from "../../types";

interface BreadcrumbProps {
  breadcrumb: AppShellBreadcrumb;
}

export function Breadcrumb({ breadcrumb }: BreadcrumbProps) {
    return (
        <div className="flex min-w-0 items-center gap-2 text-[13.5px] text-muted-foreground">
          <span>{breadcrumb.section}</span>
          <ChevronRight className="size-3.5 shrink-0" />
          <span className="truncate text-foreground">{breadcrumb.page}</span>
        </div>)
}
import { Button } from "@keidai/ui";
import { FileCode, RotateCw } from "lucide-react";
import type { AppShellPageHeader } from "../../types/index.js";

interface PageHeaderProps {
  page: AppShellPageHeader;
  onRefresh: () => void;
}

export function PageHeader({ page, onRefresh }: PageHeaderProps) {
  const showRefresh = page.showRefresh !== false;

  return (
    <div className="mb-[18px] flex items-start justify-between gap-4">
      <div>
        <div className="text-[23px] font-bold tracking-tight">{page.title}</div>
        <div className="mt-0.5 text-[13.5px] leading-normal text-muted-foreground">
          {page.description}
        </div>
      </div>

      {page.configChip || showRefresh ? (
        <div className="flex shrink-0 gap-2">
          {page.configChip ? (
            <span className="hidden h-8 items-center gap-1.5 rounded-md border border-border px-2.5 font-mono text-xs text-muted-foreground md:inline-flex">
              <FileCode className="size-3.5" />
              {page.configChip}
            </span>
          ) : null}
          {showRefresh ? (
            <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
              <RotateCw className="size-3.5" />
              Refresh
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

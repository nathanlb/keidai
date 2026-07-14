import { Button } from "@keidai/ui";

interface TablePaginationFooterProps {
  shownCount: number;
  totalCount: number;
  totalLabel: string;
  canGoNewer: boolean;
  canGoOlder: boolean;
  onPageChange: (nextIndex: number) => void;
  pageIndex: number;
  className?: string;
}

export function TablePaginationFooter({
  shownCount,
  totalCount,
  totalLabel,
  canGoNewer,
  canGoOlder,
  onPageChange,
  pageIndex,
  className,
}: TablePaginationFooterProps) {
  return (
    <div
      className={
        className ??
        "flex items-center justify-between border-t border-border px-[18px] py-2.5 text-xs text-muted-foreground"
      }
    >
      <span>
        Showing{" "}
        <span className="font-mono text-foreground">{shownCount}</span> of{" "}
        <span className="font-mono text-foreground">{totalCount}</span> {totalLabel}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canGoNewer}
          onClick={() => onPageChange(pageIndex - 1)}
        >
          Newer
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canGoOlder}
          onClick={() => onPageChange(pageIndex + 1)}
        >
          Older
        </Button>
      </div>
    </div>
  );
}

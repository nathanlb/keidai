import { Badge, cn } from "@keidai/ui";
import { TriangleAlert, X } from "lucide-react";

/** Small read-only chip for table cells — known groups are neutral, unknown groups warn. */
export function AgentGroupBadge({
  name,
  known,
  className,
}: {
  name: string;
  known: boolean;
  className?: string;
}) {
  if (known) {
    return (
      <Badge
        variant="secondary"
        className={cn("font-mono text-[11px]", className)}
      >
        {name}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-warning-fill/45 font-mono text-[11px] text-warning",
        className,
      )}
    >
      <TriangleAlert className="size-3" aria-hidden />
      {name}
    </Badge>
  );
}

/** Removable pill chip used on the Groups tab and the Create form. */
export function AgentGroupChip({
  name,
  known,
  onRemove,
  className,
}: {
  name: string;
  known: boolean;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        `
          inline-flex h-7.5 items-center gap-1.5 rounded-pill border pr-1.5 pl-3
          font-mono text-xs
        `,
        known
          ? "border-border bg-secondary text-secondary-foreground"
          : "border-warning-fill/45 bg-warning-fill/10 text-warning",
        className,
      )}
    >
      {!known ? (
        <TriangleAlert className="size-3 shrink-0" aria-hidden />
      ) : null}
      {name}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className={cn(
            `
              inline-flex shrink-0 rounded-pill p-0.5 transition-colors
              hover:bg-accent
            `,
            known ? "text-muted-foreground" : "text-warning",
          )}
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

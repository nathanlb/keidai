import { Button, Card, CardContent } from "@keidai/ui";
import { TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { APPROVALS_PATH } from "../../shell/navigation.js";
import type { HomeAttentionItem } from "../types/home-digest.js";
import { formatItemCount } from "../utils/format-home-copy.js";

const rowClassName =
  "flex items-center gap-3 border-b border-[color-mix(in_srgb,var(--amber-500)_16%,var(--border))] px-4 py-3 transition-colors duration-150 ease-out last:border-b-0 hover:bg-[color-mix(in_srgb,var(--muted)_45%,transparent)] motion-reduce:transition-none";

export function NeedsYouBand({
  items,
  actingId,
  onAct,
}: {
  items: readonly HomeAttentionItem[];
  actingId: string | null;
  onAct: (item: HomeAttentionItem) => void;
}) {
  return (
    <Card
      data-testid="home-needs-you"
      className="overflow-hidden py-0 shadow-none border-[color-mix(in_srgb,var(--amber-500)_45%,var(--border))] bg-[color-mix(in_srgb,var(--amber-500)_6%,var(--card))]"
    >
      <CardContent className="p-0">
        <div className="flex items-center gap-[9px] border-b border-[color-mix(in_srgb,var(--amber-500)_28%,var(--border))] px-4 py-[13px]">
          <TriangleAlert className="size-4 shrink-0 text-amber-500" aria-hidden />
          <span className="text-[14px] font-semibold">Needs you</span>
          <span className="font-mono text-[11.5px] text-muted-foreground">
            {formatItemCount(items.length)}
          </span>
          <Link
            to={APPROVALS_PATH}
            className="ml-auto text-[12.5px] text-muted-foreground no-underline hover:text-foreground"
          >
            Open approvals →
          </Link>
        </div>
        {items.map((item) => (
          <div key={item.id} className={rowClassName}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary font-mono text-xs font-bold text-secondary-foreground">
              {item.mark}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13.5px] font-semibold">
                  {item.tool}
                </span>
                {item.impact ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {item.impact}
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {item.context}
              </div>
            </div>
            <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
              {item.parkedLabel}
            </span>
            <div className="flex shrink-0 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-[29px] text-[12.5px]"
                asChild
              >
                <Link to={item.reviewHref}>Review</Link>
              </Button>
              <Button
                size="sm"
                className="h-[29px] text-[12.5px] font-semibold"
                disabled={actingId === item.id}
                onClick={() => onAct(item)}
              >
                {item.ctaLabel}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

import {
  Button,
  Card,
  CardContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@keidai/ui";
import { TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { APPROVALS_PATH } from "../../shell/navigation.js";
import { useActingOwner } from "../../shell/hooks/use-acting-owner.js";
import {
  APPROVE_OWNER_ONLY,
  canApproveToolCall,
  knownOperator,
} from "../../shell/utils/operator-permissions.js";
import type { HomeAttentionItem } from "../types/home-digest.js";
import { formatItemCount } from "../utils/format-home-copy.js";

const rowClassName =
  "flex items-center gap-3 border-b border-[color-mix(in_srgb,var(--warning-fill)_16%,var(--border))] px-4 py-3 transition-colors duration-150 ease-out last:border-b-0 hover:bg-[color-mix(in_srgb,var(--muted)_45%,transparent)] motion-reduce:transition-none";

export function NeedsYouBand({
  items,
  actingId,
  onAct,
}: {
  items: readonly HomeAttentionItem[];
  actingId: string | null;
  onAct: (item: HomeAttentionItem) => void;
}) {
  const { owner } = useActingOwner();
  const operator = knownOperator(owner);
  return (
    <Card
      data-testid="home-needs-you"
      className="
        overflow-hidden
        border-[color-mix(in_srgb,var(--warning-fill)_45%,var(--border))]
        bg-[color-mix(in_srgb,var(--warning-fill)_6%,var(--card))] py-0 shadow-none
      "
    >
      <CardContent className="p-0">
        <div
          className="
          flex items-center gap-2.25 border-b
          border-[color-mix(in_srgb,var(--warning-fill)_28%,var(--border))] px-4
          py-3.25
        "
        >
          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          <span className="text-[14px] font-semibold">Needs you</span>
          <span className="font-mono text-[11.5px] text-muted-foreground">
            {formatItemCount(items.length)}
          </span>
          <Link
            to={APPROVALS_PATH}
            className="
              ml-auto text-[12.5px] text-muted-foreground no-underline
              hover:text-foreground
            "
          >
            Open approvals →
          </Link>
        </div>
        {items.map((item) => (
          <div key={item.id} className={rowClassName}>
            <div
              className="
              flex size-8 shrink-0 items-center justify-center rounded-lg
              bg-secondary font-mono text-xs font-bold text-secondary-foreground
            "
            >
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
            <span
              className="
              shrink-0 font-mono text-[11.5px] text-muted-foreground
            "
            >
              {item.parkedLabel}
            </span>
            <div className="flex shrink-0 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7.25 text-[12.5px]"
                asChild
              >
                <Link to={item.reviewHref}>Review</Link>
              </Button>
              {item.approvalOwnerId &&
              !canApproveToolCall(operator, item.approvalOwnerId) ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        size="sm"
                        className="h-7.25 text-[12.5px] font-semibold"
                        disabled
                      >
                        {item.ctaLabel}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{APPROVE_OWNER_ONLY}</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  size="sm"
                  className="h-7.25 text-[12.5px] font-semibold"
                  disabled={actingId === item.id}
                  onClick={() => onAct(item)}
                >
                  {item.ctaLabel}
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

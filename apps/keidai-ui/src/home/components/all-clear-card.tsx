import { Card, CardContent } from "@keidai/ui";
import { CheckCheck } from "lucide-react";

export function AllClearCard() {
  return (
    <Card
      data-testid="home-all-clear"
      className="py-0 shadow-none"
    >
      <CardContent className="flex items-center justify-center gap-[13px] px-4 py-[22px]">
        <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--green-600)_16%,transparent)] text-(--green-600)">
          <CheckCheck className="size-[19px]" aria-hidden />
        </div>
        <div>
          <div className="text-[14px] font-semibold">Nothing needs you</div>
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            No approvals parked, no failures in the last 24 hours.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

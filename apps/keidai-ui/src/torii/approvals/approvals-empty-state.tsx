import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@keidai/ui";
import { CheckCheck, Play } from "lucide-react";
import { Link } from "react-router-dom";

export function ApprovalsEmptyState() {
  return (
    <Empty className="px-4 py-16">
      <EmptyHeader>
        <EmptyMedia className="mb-0 size-[60px] rounded-2xl bg-success/15 text-success">
          <CheckCheck className="size-7" strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle className="text-[19px] font-bold">
          You&apos;re all caught up
        </EmptyTitle>
        <EmptyDescription className="max-w-md text-[13px] leading-relaxed">
          No tool calls are waiting for review. When an agent hits a gated call,
          its run parks here the moment Torii records the request.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" asChild>
          <Link to="/shaiden/runs">
            <Play className="size-3.5" />
            View run history
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

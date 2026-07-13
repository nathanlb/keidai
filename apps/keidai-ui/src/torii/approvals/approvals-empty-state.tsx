import { Button } from "@keidai/ui";
import { CheckCheck, Play } from "lucide-react";
import { Link } from "react-router-dom";

export function ApprovalsEmptyState() {
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <div className="flex size-[60px] items-center justify-center rounded-2xl bg-success/15 text-success">
        <CheckCheck className="size-7" strokeWidth={2} />
      </div>
      <h2 className="mt-5 text-[19px] font-bold tracking-tight">
        You&apos;re all caught up
      </h2>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
        No tool calls are waiting for review. When an agent hits a gated call,
        its run parks here the moment Torii records the request.
      </p>
      <Button variant="outline" className="mt-6" asChild>
        <Link to="/shaiden/runs">
          <Play className="size-3.5" />
          View run history
        </Link>
      </Button>
    </div>
  );
}

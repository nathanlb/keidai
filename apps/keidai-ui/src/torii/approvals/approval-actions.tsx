import { Button, Textarea } from "@keidai/ui";
import { Ban, Check, X } from "lucide-react";
import { useState } from "react";

type ActionMode = "idle" | "reject" | "cancel";

interface ApprovalActionsProps {
  disabled?: boolean;
  onApprove: () => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onCancel: () => Promise<void>;
}

export function ApprovalActions({
  disabled = false,
  onApprove,
  onReject,
  onCancel,
}: ApprovalActionsProps) {
  const [mode, setMode] = useState<ActionMode>("idle");
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setMode("idle");
      setRejectReason("");
    } finally {
      setBusy(false);
    }
  };

  if (mode === "reject") {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3.5">
        <div className="text-[12.5px] font-semibold">Reject this call</div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Recorded as a denial and returned to the agent — the run may adapt or
          terminate, it is not forced to halt.
        </p>
        <Textarea
          className="mt-3 min-h-16 text-[13px]"
          placeholder="Optional reason for the agent…"
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
          disabled={busy || disabled}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setMode("idle");
              setRejectReason("");
            }}
          >
            Back
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy || disabled}
            onClick={() =>
              run(async () => {
                await onReject(rejectReason.trim() || undefined);
              })
            }
          >
            <X className="size-3.5" />
            Record denial
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "cancel") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5">
        <div className="text-[12.5px] font-semibold">Cancel the parked task?</div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Ends the run outright — the agent stops and the call is never
          dispatched.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setMode("idle")}
          >
            Keep run
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy || disabled}
            onClick={() => run(onCancel)}
          >
            <Ban className="size-3.5" />
            Cancel task
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        disabled={busy || disabled}
        onClick={() => run(onApprove)}
      >
        <Check className="size-3.5" />
        Approve & resume
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy || disabled}
        onClick={() => setMode("reject")}
      >
        <X className="size-3.5" />
        Reject
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto text-destructive hover:text-destructive"
        disabled={busy || disabled}
        onClick={() => setMode("cancel")}
      >
        <Ban className="size-3.5" />
        Cancel task
      </Button>
    </div>
  );
}

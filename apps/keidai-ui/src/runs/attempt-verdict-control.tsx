import {
  ATTEMPT_VERDICT_NOTE_MAX_LENGTH,
  type AttemptVerdict,
  type RunAttemptSummary,
} from "@keidai/shared";
import { Button, Input } from "@keidai/ui";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

export function AttemptVerdictControl({
  attempt,
  disabled,
  pending,
  onSet,
  onClear,
}: {
  attempt: RunAttemptSummary;
  disabled: boolean;
  pending: boolean;
  onSet: (verdict: AttemptVerdict, note: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [note, setNote] = useState(attempt.note ?? "");
  const [syncedKey, setSyncedKey] = useState(syncKey(attempt));
  const nextKey = syncKey(attempt);
  if (nextKey !== syncedKey) {
    setSyncedKey(nextKey);
    setNote(attempt.note ?? "");
  }

  async function choose(verdict: AttemptVerdict) {
    const trimmed = note.trim();
    if (attempt.verdict === verdict && trimmed === (attempt.note ?? "")) {
      await onClear();
      return;
    }
    await onSet(verdict, trimmed);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
      <span className="text-xs text-muted-foreground">Verdict</span>
      <Button
        type="button"
        size="sm"
        variant={attempt.verdict === "up" ? "default" : "outline"}
        aria-pressed={attempt.verdict === "up"}
        aria-label="Thumbs up"
        disabled={disabled || pending}
        onClick={() => void choose("up")}
      >
        <ThumbsUp className="size-3.5" aria-hidden />
      </Button>
      <Button
        type="button"
        size="sm"
        variant={attempt.verdict === "down" ? "default" : "outline"}
        aria-pressed={attempt.verdict === "down"}
        aria-label="Thumbs down"
        disabled={disabled || pending}
        onClick={() => void choose("down")}
      >
        <ThumbsDown className="size-3.5" aria-hidden />
      </Button>
      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional note"
        aria-label="Verdict note"
        maxLength={ATTEMPT_VERDICT_NOTE_MAX_LENGTH}
        disabled={disabled || pending}
        className="h-8 max-w-xs"
      />
    </div>
  );
}

function syncKey(attempt: RunAttemptSummary): string {
  return `${attempt.attemptIndex}:${attempt.verdictAt ?? ""}:${attempt.note ?? ""}`;
}

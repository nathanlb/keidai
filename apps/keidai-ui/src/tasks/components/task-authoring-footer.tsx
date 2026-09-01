import { Button, cn } from "@keidai/ui";
import { Archive, Calendar, Info, Loader2, Play, Save } from "lucide-react";
import { useWatch } from "react-hook-form";
import { useTaskAuthoringForm } from "../hooks/use-task-authoring-form.js";

export function TaskAuthoringFooter({
  canSubmit,
  isEditMode,
  isArchived,
  ownerId,
  onCancel,
  onArchiveRequest,
}: {
  canSubmit: boolean;
  isEditMode: boolean;
  isArchived: boolean;
  ownerId: string | undefined;
  onCancel: () => void;
  onArchiveRequest?: () => void;
}) {
  const {
    formState: { isSubmitting },
  } = useTaskAuthoringForm();
  const triggerType = useWatch({ name: "triggerType" });
  const isSchedule = triggerType === "schedule";

  return (
    <div
      className="
        flex shrink-0 flex-col gap-3 border-border pt-4
        sm:flex-row sm:items-center sm:justify-between
      "
    >
      {isEditMode && !isArchived ? (
        <Button
          type="button"
          variant="ghost"
          className="
            text-destructive
            hover:text-destructive
          "
          onClick={onArchiveRequest}
        >
          <Archive className="size-4" aria-hidden />
          Archive
        </Button>
      ) : !isEditMode ? (
        <div
          className="
            flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground
          "
        >
          <Info className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            Executes on the assigned agent · runs as{" "}
            <span className="font-mono text-foreground">{ownerId ?? "—"}</span>
          </span>
        </div>
      ) : (
        <div />
      )}
      <div
        className="
          flex shrink-0 gap-2.5
          sm:ml-auto
        "
      >
        <Button type="button" variant="ghost" onClick={onCancel}>
          {isArchived ? "Close" : "Cancel"}
        </Button>
        {!isArchived ? (
          <Button
            type="submit"
            disabled={!canSubmit}
            className={cn(!canSubmit && "opacity-45 grayscale")}
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : isEditMode ? (
              <Save className="size-4" aria-hidden />
            ) : isSchedule ? (
              <Calendar className="size-4" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            {isEditMode
              ? "Save changes"
              : isSchedule
                ? "Create"
                : "Create & run"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@keidai/ui";
import { X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { archiveTask } from "../lib/api/tasks.js";
import { TaskAuthoringView } from "./task-authoring-view.js";

interface TaskAuthoringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId?: string;
  defaultAssignee?: string;
  onTaskSaved?: () => void;
}

export function TaskAuthoringDialog({
  open,
  onOpenChange,
  taskId,
  defaultAssignee,
  onTaskSaved,
}: TaskAuthoringDialogProps) {
  const isEditMode = Boolean(taskId);
  const [isDirty, setIsDirty] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const ignoreParentCloseRef = useRef(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setIsDirty(false);
      setDiscardConfirmOpen(false);
      setArchiveConfirmOpen(false);
      setIsArchiving(false);
      setArchiveError(null);
    }
  }

  const suppressParentClose = useCallback(() => {
    ignoreParentCloseRef.current = true;
    window.setTimeout(() => {
      ignoreParentCloseRef.current = false;
    }, 0);
  }, []);

  const forceClose = useCallback(() => {
    suppressParentClose();
    setDiscardConfirmOpen(false);
    setArchiveConfirmOpen(false);
    onOpenChange(false);
  }, [onOpenChange, suppressParentClose]);

  const requestClose = useCallback(() => {
    if (isEditMode && isDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    forceClose();
  }, [forceClose, isDirty, isEditMode]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange(true);
        return;
      }
      if (ignoreParentCloseRef.current) {
        return;
      }
      requestClose();
    },
    [onOpenChange, requestClose],
  );

  const handleDiscardConfirmOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        suppressParentClose();
      }
      setDiscardConfirmOpen(nextOpen);
    },
    [suppressParentClose],
  );

  const handleArchiveConfirmOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        suppressParentClose();
        setArchiveError(null);
      }
      setArchiveConfirmOpen(nextOpen);
    },
    [suppressParentClose],
  );

  const handleKeepEditing = useCallback(() => {
    suppressParentClose();
    setDiscardConfirmOpen(false);
  }, [suppressParentClose]);

  const handleTaskSaved = useCallback(() => {
    onTaskSaved?.();
    forceClose();
  }, [forceClose, onTaskSaved]);

  const handleArchiveRequest = useCallback(() => {
    setArchiveError(null);
    setArchiveConfirmOpen(true);
  }, []);

  const handleArchiveConfirm = useCallback(async () => {
    if (!taskId) {
      return;
    }

    setIsArchiving(true);
    setArchiveError(null);
    try {
      await archiveTask(taskId);
      onTaskSaved?.();
      forceClose();
    } catch (error) {
      setArchiveError(
        error instanceof Error ? error.message : "Failed to archive task",
      );
    } finally {
      setIsArchiving(false);
    }
  }, [forceClose, onTaskSaved, taskId]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="
          flex max-h-[min(90vh,920px)] min-h-0 max-w-180 flex-col gap-0
          overflow-hidden p-0
          sm:rounded-xl
        "
        >
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="
                absolute top-4 right-4 z-10 size-8 opacity-70
                hover:opacity-100
              "
              aria-label="Close"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </DialogClose>

          <DialogHeader className="shrink-0 px-6 pt-6 pr-14 pb-2">
            <DialogTitle>{isEditMode ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update the saved definition. Past runs keep the goal and config from when they started."
                : "Define a goal, pick an agent, and run it. Tasks are authored here and execute on the assigned agent."}
            </DialogDescription>
          </DialogHeader>

          <TaskAuthoringView
            key={taskId ?? "new"}
            taskId={taskId}
            defaultAssignee={defaultAssignee}
            onCancel={requestClose}
            onTaskSaved={handleTaskSaved}
            onDirtyChange={setIsDirty}
            onArchiveRequest={isEditMode ? handleArchiveRequest : undefined}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={discardConfirmOpen}
        onOpenChange={handleDiscardConfirmOpenChange}
      >
        <DialogContent
          className="
          max-w-105
          sm:rounded-xl
        "
        >
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>
              Your edits to this task will not be saved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            className="
            gap-2
            sm:gap-0
          "
          >
            <Button type="button" variant="outline" onClick={handleKeepEditing}>
              Keep editing
            </Button>
            <Button type="button" variant="destructive" onClick={forceClose}>
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archiveConfirmOpen}
        onOpenChange={handleArchiveConfirmOpenChange}
      >
        <DialogContent
          className="
          max-w-105
          sm:rounded-xl
        "
        >
          <DialogHeader>
            <DialogTitle>Archive task?</DialogTitle>
            <DialogDescription>
              This removes the task from your saved list. Past runs are kept,
              but you cannot restore the task from the UI.
            </DialogDescription>
          </DialogHeader>
          {archiveError ? (
            <p className="text-sm text-destructive">{archiveError}</p>
          ) : null}
          <DialogFooter
            className="
            gap-2
            sm:gap-0
          "
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => setArchiveConfirmOpen(false)}
              disabled={isArchiving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleArchiveConfirm()}
              disabled={isArchiving}
            >
              Archive task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

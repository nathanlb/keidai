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
import { useCallback, useEffect, useRef, useState } from "react";
import { TaskAuthoringView } from "./task-authoring-view.js";

interface TaskAuthoringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId?: string;
  onTaskSaved?: () => void;
}

export function TaskAuthoringDialog({
  open,
  onOpenChange,
  taskId,
  onTaskSaved,
}: TaskAuthoringDialogProps) {
  const isEditMode = Boolean(taskId);
  const [isDirty, setIsDirty] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const ignoreParentCloseRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setIsDirty(false);
      setDiscardConfirmOpen(false);
    }
  }, [open]);

  const suppressParentClose = useCallback(() => {
    ignoreParentCloseRef.current = true;
    window.setTimeout(() => {
      ignoreParentCloseRef.current = false;
    }, 0);
  }, []);

  const forceClose = useCallback(() => {
    suppressParentClose();
    setDiscardConfirmOpen(false);
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

  const handleKeepEditing = useCallback(() => {
    suppressParentClose();
    setDiscardConfirmOpen(false);
  }, [suppressParentClose]);

  const handleTaskSaved = useCallback(() => {
    onTaskSaved?.();
    forceClose();
  }, [forceClose, onTaskSaved]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[min(90vh,920px)] min-h-0 max-w-[720px] flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 z-10 size-8 opacity-70 hover:opacity-100"
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
            onCancel={requestClose}
            onTaskSaved={handleTaskSaved}
            onDirtyChange={setIsDirty}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={discardConfirmOpen}
        onOpenChange={handleDiscardConfirmOpenChange}
      >
        <DialogContent className="max-w-[420px] sm:rounded-xl">
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>
              Your edits to this task will not be saved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleKeepEditing}>
              Keep editing
            </Button>
            <Button type="button" variant="destructive" onClick={forceClose}>
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

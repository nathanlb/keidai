import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@keidai/ui";
import { X } from "lucide-react";
import { TaskAuthoringView } from "./task-authoring-view.js";

interface TaskAuthoringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskAuthoringDialog({
  open,
  onOpenChange,
}: TaskAuthoringDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Define a goal, pick an agent, and run it. Tasks are authored here
            and execute on the assigned agent.
          </DialogDescription>
        </DialogHeader>

        <TaskAuthoringView onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

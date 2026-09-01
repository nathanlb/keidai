import { Calendar, GitBranch, Zap } from "lucide-react";
import { useWatch } from "react-hook-form";
import { useTaskAuthoringForm } from "../hooks/use-task-authoring-form.js";
import { FieldHeader } from "./field-header.js";
import { TaskScheduleFields } from "./task-schedule-fields.js";
import { TriggerChip } from "./trigger-chip.js";

export function TaskTriggerSection({
  disabled,
  isEditMode,
  scheduleFailure,
}: {
  disabled: boolean;
  isEditMode: boolean;
  scheduleFailure: string | null;
}) {
  const { control, setValue } = useTaskAuthoringForm();
  const triggerType = useWatch({ control, name: "triggerType" });
  const isSchedule = triggerType === "schedule";

  return (
    <section className="border-b border-border py-5">
      <FieldHeader
        icon={<Zap className="size-3.5" aria-hidden />}
        label="Trigger"
      />
      <p
        className="
          mt-1 mb-2.5 text-[12.5px] leading-normal text-muted-foreground
        "
      >
        {isSchedule
          ? "Fires at the local time in the timezone you pick. Play still starts a run now."
          : "Runs when you start it. Scheduled tasks fire on their own."}
      </p>
      <div className="flex gap-2">
        <TriggerChip
          selected={!isSchedule}
          disabled={disabled}
          icon={<Zap className="size-3.5" aria-hidden />}
          label="Now"
          onClick={() =>
            setValue("triggerType", "now", {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
        <TriggerChip
          selected={isSchedule}
          disabled={disabled}
          icon={<Calendar className="size-3.5" aria-hidden />}
          label="Scheduled"
          onClick={() =>
            setValue("triggerType", "schedule", {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
        <TriggerChip
          disabled
          icon={<GitBranch className="size-3.5" aria-hidden />}
          label="On event"
        />
      </div>
      {isSchedule ? (
        <TaskScheduleFields
          disabled={disabled}
          isEditMode={isEditMode}
          scheduleFailure={scheduleFailure}
        />
      ) : null}
    </section>
  );
}

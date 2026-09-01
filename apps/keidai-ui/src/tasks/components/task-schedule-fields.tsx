import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  ToggleGroup,
  ToggleGroupItem,
} from "@keidai/ui";
import { WEEKDAYS } from "@keidai/shared";
import { CircleAlert, Pause } from "lucide-react";
import { useWatch } from "react-hook-form";
import { useTaskAuthoringForm } from "../hooks/use-task-authoring-form.js";
import { previewScheduleNextFire } from "../utils/preview-schedule-next-fire.js";

const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

function timezoneOptions(current: string): string[] {
  if (TIMEZONE_OPTIONS.includes(current)) {
    return TIMEZONE_OPTIONS;
  }
  return [current, ...TIMEZONE_OPTIONS];
}

function ScheduleNextFireHint() {
  const timezone = useWatch({ name: "timezone" });
  const at = useWatch({ name: "at" });
  const repeat = useWatch({ name: "repeat" });
  const freq = useWatch({ name: "freq" });
  const days = useWatch({ name: "days" });
  const paused = useWatch({ name: "paused" });
  const preview = previewScheduleNextFire({
    timezone,
    at,
    repeat,
    freq,
    days,
    paused,
  });

  if (preview.status === "invalid") {
    return (
      <p className="text-[12.5px] text-muted-foreground">
        Pick a valid time and timezone.
      </p>
    );
  }

  if (preview.status === "none") {
    return (
      <p className="text-[12.5px] text-muted-foreground">No upcoming fire.</p>
    );
  }

  return (
    <p className="text-[12.5px] text-muted-foreground">
      Next fire <span className="font-mono text-foreground">{preview.iso}</span>{" "}
      UTC
    </p>
  );
}

export function TaskScheduleFields({
  disabled,
  isEditMode,
  scheduleFailure,
}: {
  disabled: boolean;
  isEditMode: boolean;
  scheduleFailure: string | null;
}) {
  const { control, register, setValue } = useTaskAuthoringForm();
  const timezone = useWatch({ control, name: "timezone" });
  const repeat = useWatch({ control, name: "repeat" });
  const freq = useWatch({ control, name: "freq" });
  const days = useWatch({ control, name: "days" });
  const paused = useWatch({ control, name: "paused" });

  return (
    <div className="mt-4 flex flex-col gap-3">
      {scheduleFailure !== null ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" aria-hidden />
          <AlertTitle>Schedule stopped</AlertTitle>
          <AlertDescription>
            {scheduleFailure
              ? `Could not start a run after two attempts (${scheduleFailure}). Change the schedule and save to try again.`
              : "Could not start a run after two attempts. Change the schedule and save to try again."}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="min-w-0 flex-1 text-xs text-muted-foreground">
          First fire
          <Input
            type="datetime-local"
            className="mt-1.5"
            disabled={disabled}
            {...register("at")}
          />
        </label>
        <label className="min-w-0 flex-1 text-xs text-muted-foreground">
          Timezone
          <Input
            className="mt-1.5 font-mono"
            list="task-timezones"
            disabled={disabled}
            {...register("timezone")}
          />
          <datalist id="task-timezones">
            {timezoneOptions(timezone).map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" disabled={disabled} {...register("repeat")} />
        Repeat
      </label>
      {repeat ? (
        <div className="flex flex-col gap-2">
          <ToggleGroup
            type="single"
            value={freq}
            onValueChange={(value) => {
              if (
                value === "daily" ||
                value === "weekly" ||
                value === "monthly"
              ) {
                setValue("freq", value, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }
            }}
            variant="outline"
            size="sm"
            className="justify-start"
            disabled={disabled}
          >
            <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
            <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
            <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
          </ToggleGroup>
          {freq === "weekly" ? (
            <ToggleGroup
              type="multiple"
              value={days}
              onValueChange={(value) =>
                setValue("days", value as typeof days, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              variant="outline"
              size="sm"
              className="justify-start"
              disabled={disabled}
            >
              {WEEKDAYS.map((day) => (
                <ToggleGroupItem key={day} value={day} aria-label={day}>
                  {`${day.slice(0, 1).toUpperCase()}${day.slice(1, 2)}`}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
        </div>
      ) : null}
      <ScheduleNextFireHint />
      {isEditMode && !disabled ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setValue("paused", !paused, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        >
          <Pause className="size-3.5" aria-hidden />
          {paused ? "Resume schedule" : "Pause schedule"}
        </Button>
      ) : null}
    </div>
  );
}

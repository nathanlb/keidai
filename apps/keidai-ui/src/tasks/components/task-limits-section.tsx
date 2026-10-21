import { Input } from "@keidai/ui";
import { Repeat, SlidersHorizontal, Timer } from "lucide-react";
import { useId, type ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { FieldHeader } from "../../shell/forms/field-header.js";
import { useTaskAuthoringForm } from "../hooks/use-task-authoring-form.js";
import {
  MAX_TASK_ITERATIONS,
  MAX_TASK_TIMEOUT_MINUTES,
  MIN_TASK_ITERATIONS,
  MIN_TASK_TIMEOUT_MINUTES,
} from "../schemas/task-authoring-form-schema.js";

export function TaskLimitsSection({ disabled }: { disabled?: boolean }) {
  const iterationId = useId();
  const timeoutId = useId();
  const {
    register,
    control,
    formState: { errors },
  } = useTaskAuthoringForm();
  const unlimited = useWatch({ control, name: "unlimited" });
  const fieldsDisabled = Boolean(disabled || unlimited);

  return (
    <section>
      <FieldHeader
        icon={<SlidersHorizontal className="size-3.5" aria-hidden />}
        label="Limits"
      />
      <p className="mt-1 mb-2.5 text-xs leading-normal text-muted-foreground">
        A run stops with <span className="font-mono">iteration_exhausted</span>{" "}
        or <span className="font-mono">timeout</span> if it hits these. With no
        limits, it runs until the agent marks the goal complete or failed.
      </p>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={disabled} {...register("unlimited")} />
        No limits
      </label>
      <div className="flex gap-3">
        <LimitField
          id={iterationId}
          label="Iteration cap"
          icon={<Repeat className="size-3.5" aria-hidden />}
          min={MIN_TASK_ITERATIONS}
          max={MAX_TASK_ITERATIONS}
          disabled={fieldsDisabled}
          error={errors.maxIterations?.message}
          registration={register("maxIterations")}
        />
        <LimitField
          id={timeoutId}
          label="Wall-clock timeout (minutes)"
          icon={<Timer className="size-3.5" aria-hidden />}
          min={MIN_TASK_TIMEOUT_MINUTES}
          max={MAX_TASK_TIMEOUT_MINUTES}
          disabled={fieldsDisabled}
          error={errors.timeoutMinutes?.message}
          registration={register("timeoutMinutes")}
        />
      </div>
    </section>
  );
}

function LimitField({
  id,
  label,
  icon,
  min,
  max,
  disabled,
  error,
  registration,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  min: number;
  max: number;
  disabled: boolean;
  error: string | undefined;
  registration: UseFormRegisterReturn;
}) {
  return (
    <div className="min-w-0 flex-1">
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs text-muted-foreground"
      >
        {label}
      </label>
      <div className="relative">
        <span
          className="
            pointer-events-none absolute top-1/2 left-3 -translate-y-1/2
            text-muted-foreground
          "
        >
          {icon}
        </span>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="pl-9 font-mono"
          {...registration}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

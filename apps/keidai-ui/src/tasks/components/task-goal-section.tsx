import { Textarea } from "@keidai/ui";
import { Target } from "lucide-react";
import { useId } from "react";
import { useTaskAuthoringForm } from "../hooks/use-task-authoring-form.js";
import { FieldHeader } from "./field-header.js";

export function TaskGoalSection({ disabled }: { disabled: boolean }) {
  const goalId = useId();
  const { register } = useTaskAuthoringForm();

  return (
    <section className="border-b border-border py-5">
      <FieldHeader
        icon={<Target className="size-4" aria-hidden />}
        label="Goal"
        required
      />
      <p
        className="
          mt-1 mb-2.5 text-[12.5px] leading-normal text-muted-foreground
        "
      >
        Natural-language definition of done. The agent self-assesses completion
        against it.
      </p>
      <Textarea
        id={goalId}
        {...register("goal")}
        placeholder={`Describe what "done" looks like…  e.g. "Draft and send the weekly newsletter, but pause for my approval before sending."`}
        required
        disabled={disabled}
        className="
          min-h-29.5 text-[13.5px] leading-relaxed
          focus-visible:ring-[3px] focus-visible:ring-ring/30
        "
      />
    </section>
  );
}

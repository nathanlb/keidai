import { Cpu } from "lucide-react";
import { useWatch } from "react-hook-form";
import type { ManagementAgent } from "../../lib/api/agents.js";
import { ModelPicker } from "../../models/model-picker.js";
import { useTaskAuthoringForm } from "../hooks/use-task-authoring-form.js";
import { FieldHeader } from "../../shell/forms/field-header.js";

export function TaskModelSection({
  agents,
  disabled,
}: {
  agents: ManagementAgent[];
  disabled?: boolean;
}) {
  const { setValue, control } = useTaskAuthoringForm();
  const modelId = useWatch({ control, name: "modelId" });
  const assignee = useWatch({ control, name: "assignee" });
  const agentDefault = agents.find(
    (agent) => agent.id === assignee,
  )?.defaultModelId;
  const emptyLabel = agentDefault
    ? `Agent default (${agentDefault})`
    : "Agent default";

  return (
    <section>
      <FieldHeader
        icon={<Cpu className="size-3.5" aria-hidden />}
        label="Model"
      />
      <p className="mt-1 mb-2.5 text-[12.5px] leading-normal text-muted-foreground">
        Optional. Leave this on the agent default unless this task should use a
        different tool-use model.
      </p>
      <ModelPicker
        value={modelId}
        disabled={disabled}
        emptyLabel={emptyLabel}
        onChange={(next) =>
          setValue("modelId", next, { shouldDirty: true, shouldValidate: true })
        }
      />
    </section>
  );
}

import {
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@keidai/ui";
import { Bot } from "lucide-react";
import { Controller, useWatch } from "react-hook-form";
import { useTaskAuthoringForm } from "../hooks/use-task-authoring-form.js";
import type { AgentAssigneeOption } from "../utils/to-agent-assignee-option.js";
import { FieldHeader } from "./field-header.js";

function AssigneeTriggerContent({
  option,
}: {
  option: AgentAssigneeOption | null;
}) {
  if (!option) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span
          className="
            flex size-7 shrink-0 items-center justify-center rounded-full border
            border-dashed border-border text-muted-foreground
          "
        >
          <Bot className="size-3.5" aria-hidden />
        </span>
        <span className="text-[13px] text-muted-foreground">
          Select an agent
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <span
        className="
          inline-flex size-7 shrink-0 items-center justify-center rounded-md
          bg-secondary text-[11px] font-medium text-secondary-foreground
        "
      >
        {option.initials}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] font-semibold text-foreground">
          {option.displayName}
        </span>
        <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
          {option.agentId}
        </span>
      </span>
      {option.connected ? (
        <span
          className="
            ml-auto inline-flex shrink-0 items-center gap-1.5 text-[11.5px]
            text-(--green-600)
          "
        >
          <span
            className="size-1.5 rounded-full bg-(--green-600)"
            aria-hidden
          />
          connected
        </span>
      ) : null}
    </div>
  );
}

export function TaskAssigneeSection({
  disabled,
  options,
  agentsLoading,
  runtimeLoading,
  agentsError,
  runtimeError,
  runtimeReady,
}: {
  disabled: boolean;
  options: AgentAssigneeOption[];
  agentsLoading: boolean;
  runtimeLoading: boolean;
  agentsError: unknown;
  runtimeError: unknown;
  runtimeReady: boolean;
}) {
  const { control } = useTaskAuthoringForm();
  const assignee = useWatch({ control, name: "assignee" });
  const selectedOption =
    options.find((option) => option.agentId === assignee) ?? null;

  return (
    <section className="border-b border-border py-5">
      <FieldHeader
        icon={<Bot className="size-3.5" aria-hidden />}
        label="Assignee"
        required
      />

      {agentsLoading || runtimeLoading ? (
        <p className="text-sm text-muted-foreground">
          {agentsLoading ? "Loading agents…" : "Loading runtime…"}
        </p>
      ) : agentsError ? (
        <p className="text-sm text-destructive">
          Could not load agents from the gateway.
        </p>
      ) : runtimeError ? (
        <p className="text-sm text-destructive">
          Could not load Shaiden runtime.
        </p>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No agents registered yet.
        </p>
      ) : !runtimeReady ? (
        <p className="text-sm text-muted-foreground">
          Shaiden runtime is unavailable.
        </p>
      ) : (
        <Controller
          name="assignee"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value || undefined}
              onValueChange={field.onChange}
              disabled={disabled}
            >
              <SelectTrigger
                className={cn(
                  `
                    h-auto min-h-11 w-full items-center gap-2.5
                    border-input px-3 py-2
                  `,
                )}
              >
                <AssigneeTriggerContent option={selectedOption} />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem
                    key={option.agentId}
                    value={option.agentId}
                    disabled={!option.connected}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className="
                          inline-flex size-7 items-center justify-center
                          rounded-md bg-secondary text-[11px] font-medium
                          text-secondary-foreground
                        "
                      >
                        {option.initials}
                      </span>
                      <span className="flex flex-row items-center gap-2">
                        <span className="text-[13px] font-semibold">
                          {option.displayName}
                        </span>
                        <span
                          className="
                            font-mono text-[11.5px] text-muted-foreground
                          "
                        >
                          {option.agentId}
                        </span>
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      )}
    </section>
  );
}

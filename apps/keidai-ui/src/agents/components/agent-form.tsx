import { Badge, Button, cn, Input, Spinner, Textarea } from "@keidai/ui";
import {
  Check,
  Cpu,
  Hash,
  Info,
  Lock,
  Plus,
  Save,
  ScrollText,
  Server,
  Tag,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  checkSlugAvailability,
  type ManagementAgent,
} from "../../lib/api/agents.js";
import { PLATFORM_BEARER_ID } from "../../lib/constants/platform-bearer.js";
import { ModelPicker } from "../../models/model-picker.js";
import { FieldHeader } from "../../shell/forms/field-header.js";
import { useZodForm } from "../../shell/forms/use-zod-form.js";
import { useActingOwner } from "../../shell/hooks/use-acting-owner.js";
import { useFetchBearers } from "../hooks/use-fetch-bearers.js";
import { useFetchToriiGroups } from "../hooks/use-fetch-torii-groups.js";
import {
  createAgentFormSchema,
  type CreateAgentFormValues,
} from "../schemas/create-agent-form-schema.js";
import { isKnownGroup } from "../utils/collect-unknown-groups.js";
import { slugifyAgentName } from "../utils/slugify-agent-name.js";
import { validateAgentSlug } from "../utils/validate-agent-slug.js";
import { AgentGroupChip } from "./agent-group-chip.js";

const SLUG_CHECK_DEBOUNCE_MS = 300;

const EMPTY_FORM_VALUES: CreateAgentFormValues = {
  name: "",
  slug: "",
  groups: [],
  persona: "",
  modelId: "",
};

type SlugStatus = "empty" | "invalid" | "checking" | "available" | "taken";

export type AgentFormProps =
  | {
      mode: "create";
      onSubmit: (values: CreateAgentFormValues) => Promise<void>;
      onCancel: () => void;
    }
  | {
      mode: "edit";
      agent: ManagementAgent;
      onSubmit: (values: CreateAgentFormValues) => Promise<void>;
    };

function agentFormValues(agent: ManagementAgent): CreateAgentFormValues {
  return {
    name: agent.name,
    slug: agent.slug,
    groups: agent.groups,
    persona: agent.persona,
    modelId: agent.defaultModelId ?? "",
  };
}

function FieldHint({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 mb-2.5 text-[12.5px] leading-normal text-muted-foreground">
      {children}
    </p>
  );
}

function LockedBadge({ children }: { children: ReactNode }) {
  return (
    <Badge variant="secondary" className="gap-1.5 text-[10.5px] font-normal">
      <Lock className="size-3" aria-hidden />
      {children}
    </Badge>
  );
}

/** Create and edit share one form. Slug, owner, and runtime are create-only. */
export function AgentForm(props: AgentFormProps) {
  const isCreate = props.mode === "create";
  const agent = props.mode === "edit" ? props.agent : null;
  const { owner } = useActingOwner();
  const { data: toriiGroupsData } = useFetchToriiGroups();
  const { data: bearersData } = useFetchBearers();
  const toriiGroups = toriiGroupsData?.groups;
  const knownGroupNames = useMemo(
    () => (toriiGroups ?? []).map((group) => group.name),
    [toriiGroups],
  );

  const [slugTouched, setSlugTouched] = useState(false);
  const [availability, setAvailability] = useState<{
    slug: string;
    status: Extract<SlugStatus, "available" | "taken">;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isSubmitting, isValid, isDirty },
  } = useZodForm(createAgentFormSchema, {
    defaultValues: agent ? agentFormValues(agent) : EMPTY_FORM_VALUES,
  });

  const agentSyncKey = agent ? `${agent.id}\0${agent.updatedAt}` : null;
  useEffect(() => {
    if (agent) {
      reset(agentFormValues(agent));
    }
    // Reset only when the saved record changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSyncKey, reset]);

  const name = watch("name");
  const slugValue = watch("slug");
  const groups = watch("groups");
  const modelId = watch("modelId");

  const charsetValidity = validateAgentSlug(slugValue);
  const trimmedSlug = slugValue.trim();
  const slugStatus: SlugStatus = (() => {
    if (charsetValidity !== "valid") {
      return charsetValidity;
    }
    if (!trimmedSlug) {
      return "empty";
    }
    if (availability?.slug === trimmedSlug) {
      return availability.status;
    }
    return "checking";
  })();

  useEffect(() => {
    if (isCreate && !slugTouched) {
      setValue("slug", slugifyAgentName(name), { shouldValidate: true });
    }
  }, [isCreate, name, slugTouched, setValue]);

  useEffect(() => {
    if (!isCreate || charsetValidity !== "valid" || !trimmedSlug) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void checkSlugAvailability(trimmedSlug)
        .then(({ available }) => {
          if (!cancelled) {
            setAvailability({
              slug: trimmedSlug,
              status: available ? "available" : "taken",
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAvailability({ slug: trimmedSlug, status: "taken" });
          }
        });
    }, SLUG_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isCreate, trimmedSlug, charsetValidity]);

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setValue("slug", value, { shouldValidate: true });
  }

  function removeGroup(group: string) {
    setValue(
      "groups",
      groups.filter((existing) => existing !== group),
      { shouldDirty: true, shouldValidate: true },
    );
  }

  function addGroup(group: string) {
    const candidate = group.trim();
    if (!candidate || groups.includes(candidate)) {
      return;
    }
    setValue("groups", [...groups, candidate], {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  const canSubmit = isCreate
    ? Boolean(owner) && isValid && slugStatus === "available" && !isSubmitting
    : isValid && isDirty && !isSubmitting;

  const runner =
    bearersData?.bearers.find(
      (bearer) => bearer.bearerId === PLATFORM_BEARER_ID,
    ) ?? bearersData?.bearers[0];

  const onSubmit = handleSubmit(async (values) => {
    if (!canSubmit) {
      return;
    }
    setSubmitError(null);
    try {
      await props.onSubmit(values);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : isCreate
            ? "Failed to create agent"
            : "Failed to save agent",
      );
    }
  });

  const slugMessage = (() => {
    switch (slugStatus) {
      case "empty":
        return {
          text: "Lowercase letters, numbers, and dashes. Appears in every trace.",
          tone: "muted" as const,
        };
      case "invalid":
        return {
          text: "Use lowercase letters, numbers, and single dashes only.",
          tone: "destructive" as const,
        };
      case "checking":
        return { text: "Checking availability…", tone: "muted" as const };
      case "taken":
        return {
          text: `${slugValue.trim()} is already taken by another agent.`,
          tone: "destructive" as const,
        };
      case "available":
        return {
          text: `${slugValue.trim()} is available.`,
          tone: "success" as const,
        };
    }
  })();

  const personaHelp = agent
    ? `Saving a change appends v${agent.currentPersonaVersion + 1}. v${agent.currentPersonaVersion} stays pinned to past runs.`
    : "Saved as version 1. Later edits append new versions.";

  return (
    <form className="flex max-w-170 flex-col" onSubmit={onSubmit}>
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
        <section>
          <FieldHeader
            icon={<Tag className="size-3.5" aria-hidden />}
            label="Name"
          />
          <FieldHint>
            {isCreate
              ? "Display string. Freely editable later."
              : "Display string. The slug in traces does not change."}
          </FieldHint>
          <Input
            {...register("name")}
            placeholder="Agent Name"
            className="h-9.5"
          />
        </section>

        {isCreate ? (
          <section>
            <FieldHeader
              icon={<Hash className="size-3.5" aria-hidden />}
              label="Slug"
              required
              badge={<LockedBadge>Immutable after creation</LockedBadge>}
            />
            <FieldHint>
              Stable identifier Torii and Fuda use for this agent.
            </FieldHint>
            <Input
              value={slugValue}
              onChange={(event) => handleSlugChange(event.target.value)}
              placeholder="agent-slug"
              className={cn(
                "h-9.5 font-mono",
                slugMessage.tone === "destructive" && "border-destructive",
                slugMessage.tone === "success" && "border-(--green-600)",
              )}
            />
            <div
              className={cn(
                "mt-1.5 flex items-center gap-1.5 text-[11.5px]",
                slugMessage.tone === "destructive" && "text-destructive",
                slugMessage.tone === "success" && "text-(--green-600)",
                slugMessage.tone !== "destructive" &&
                  slugMessage.tone !== "success" &&
                  "text-muted-foreground",
              )}
            >
              {slugMessage.tone === "destructive" ? (
                <TriangleAlert className="size-3 shrink-0" aria-hidden />
              ) : slugMessage.tone === "success" ? (
                <Check className="size-3 shrink-0" aria-hidden />
              ) : slugStatus === "checking" ? (
                <Spinner className="size-3 shrink-0" aria-hidden />
              ) : null}
              {slugMessage.text}
            </div>
          </section>
        ) : null}

        <section>
          <FieldHeader
            icon={<UsersRound className="size-3.5" aria-hidden />}
            label="Groups"
          />
          <FieldHint>
            {groups.length === 0
              ? "No groups. Every tool call this agent makes will be denied at the gateway."
              : "Torii group policy decides which tools this agent can call."}
          </FieldHint>
          {groups.length > 0 ? (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {groups.map((group) => (
                <AgentGroupChip
                  key={group}
                  name={group}
                  known={isKnownGroup(group, knownGroupNames)}
                  onRemove={() => removeGroup(group)}
                />
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {knownGroupNames
              .filter((groupName) => !groups.includes(groupName))
              .map((groupName) => (
                <button
                  type="button"
                  key={groupName}
                  onClick={() => addGroup(groupName)}
                  className="
                    inline-flex h-7 items-center gap-1.5 rounded-full border
                    border-dashed border-border px-2.5 font-mono text-[11.5px]
                    text-muted-foreground
                    hover:bg-accent
                  "
                >
                  + {groupName}
                </button>
              ))}
          </div>
        </section>

        <section>
          <FieldHeader
            icon={<Cpu className="size-3.5" aria-hidden />}
            label="Default model"
          />
          <FieldHint>
            Optional. Tool-use models from OpenRouter. Tasks can override this.
          </FieldHint>
          <ModelPicker
            value={modelId}
            onChange={(next) =>
              setValue("modelId", next, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            emptyLabel="Platform default"
          />
        </section>

        <section>
          <FieldHeader
            icon={<ScrollText className="size-3.5" aria-hidden />}
            label="Persona"
            required
          />
          <FieldHint>{personaHelp}</FieldHint>
          <Textarea
            {...register("persona")}
            placeholder="Describe how this agent should behave…"
            className="
              min-h-37.5 text-[13.5px] leading-relaxed
              focus-visible:ring-[3px] focus-visible:ring-ring/30
            "
          />
        </section>

        {isCreate ? (
          <section>
            <FieldHeader
              icon={<Server className="size-3.5" aria-hidden />}
              label="Runtime"
              badge={<LockedBadge>Assigned automatically</LockedBadge>}
            />
            <FieldHint>
              Shaiden in this ecosystem. Fuda grants{" "}
              <span className="font-mono">
                {runner?.bearerId ?? PLATFORM_BEARER_ID}
              </span>{" "}
              when the agent is created.
            </FieldHint>
            <div
              className="
                flex items-center gap-2.5 rounded-md border border-border
                bg-muted px-3 py-2.5 font-mono text-[13.5px] opacity-75
              "
            >
              {runner?.displayName ?? PLATFORM_BEARER_ID}
            </div>
          </section>
        ) : null}

        {submitError ? (
          <p className="text-sm text-destructive">{submitError}</p>
        ) : null}
      </div>

      <div
        className="
          flex shrink-0 flex-col gap-3 pt-4
          sm:flex-row sm:items-center sm:justify-between
        "
      >
        {isCreate ? (
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              Owned by{" "}
              <span className="font-mono text-foreground">
                {owner?.ownerId ?? "—"}
              </span>{" "}
              · fixed at registration
            </span>
          </div>
        ) : (
          <div />
        )}
        <div className="flex shrink-0 gap-2.5 sm:ml-auto">
          {props.mode === "create" ? (
            <Button type="button" variant="ghost" onClick={props.onCancel}>
              Cancel
            </Button>
          ) : isDirty && agent ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => reset(agentFormValues(agent))}
            >
              Discard
            </Button>
          ) : null}
          <Button
            type="submit"
            disabled={!canSubmit}
            className={cn(!canSubmit && "opacity-45 grayscale")}
          >
            {isSubmitting ? (
              <Spinner className="size-4" aria-hidden />
            ) : isCreate ? (
              <Plus className="size-4" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            {isCreate ? "Create agent" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

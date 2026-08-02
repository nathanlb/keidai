import { Button, Input, Spinner, Textarea } from "@keidai/ui";
import { ArrowLeft, Check, Lock, TriangleAlert, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useSWRConfig } from "swr";
import { checkSlugAvailability, createAgent } from "../api/fuda-client.js";
import { AGENTS_KEY } from "../../shell/hooks/use-fetch-agents.js";
import { useActingOwner } from "../../shell/hooks/use-acting-owner.js";
import { useZodForm } from "../../shell/forms/use-zod-form.js";
import { useFetchToriiGroups } from "../hooks/use-fetch-torii-groups.js";
import { AgentGroupChip } from "./components/agent-group-chip.js";
import {
  createAgentFormSchema,
  type CreateAgentFormValues,
} from "./schemas/create-agent-form-schema.js";
import { isKnownGroup } from "./utils/collect-unknown-groups.js";
import { slugifyAgentName } from "./utils/slugify-agent-name.js";
import { validateAgentSlug } from "./utils/validate-agent-slug.js";

const SLUG_CHECK_DEBOUNCE_MS = 300;

const EMPTY_FORM_VALUES: CreateAgentFormValues = {
  name: "",
  slug: "",
  groups: [],
  persona: "",
};

type SlugStatus = "empty" | "invalid" | "checking" | "available" | "taken";

export function AgentCreateView() {
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const { owner } = useActingOwner();
  const { data: toriiGroupsData } = useFetchToriiGroups();
  const toriiGroups = toriiGroupsData?.groups ?? [];
  const knownGroupNames = useMemo(
    () => toriiGroups.map((group) => group.name),
    [toriiGroups],
  );

  const [slugTouched, setSlugTouched] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("empty");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting, isValid },
  } = useZodForm(createAgentFormSchema, {
    defaultValues: EMPTY_FORM_VALUES,
  });

  const name = watch("name");
  const slugValue = watch("slug");
  const groups = watch("groups");

  const charsetValidity = validateAgentSlug(slugValue);

  useEffect(() => {
    if (!slugTouched) {
      setValue("slug", slugifyAgentName(name), { shouldValidate: true });
    }
  }, [name, slugTouched, setValue]);

  useEffect(() => {
    if (charsetValidity !== "valid") {
      setSlugStatus(charsetValidity);
      return;
    }

    setSlugStatus("checking");
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void checkSlugAvailability(slugValue.trim())
        .then(({ available }) => {
          if (!cancelled) {
            setSlugStatus(available ? "available" : "taken");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSlugStatus("taken");
          }
        });
    }, SLUG_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slugValue, charsetValidity]);

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setValue("slug", value, { shouldValidate: true });
  }

  function removeGroup(group: string) {
    setValue(
      "groups",
      groups.filter((existing) => existing !== group),
      { shouldValidate: true },
    );
  }

  function addGroup(group: string) {
    const candidate = group.trim();
    if (!candidate || groups.includes(candidate)) {
      return;
    }
    setValue("groups", [...groups, candidate], { shouldValidate: true });
  }

  const canCreate =
    isValid && slugStatus === "available" && !isSubmitting;

  const onSubmit = handleSubmit(async (values) => {
    if (!canCreate) {
      return;
    }
    setSubmitError(null);
    try {
      const { agent } = await createAgent({
        slug: values.slug.trim(),
        name: values.name.trim() || values.slug.trim(),
        ownerId: owner.ownerId,
        groups: values.groups,
        persona: values.persona,
      });
      await mutate(AGENTS_KEY);
      navigate(`/agents/${agent.id}?tab=access`, {
        state: {
          toast: "Agent created. Grant a bearer so a process can act as it.",
        },
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to create agent",
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

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 mb-3 text-muted-foreground"
        onClick={() => navigate("/agents")}
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All agents
      </Button>

      <div className="text-[23px] font-bold tracking-tight">New agent</div>
      <p className="mb-5 mt-0.5 text-[13.5px] text-muted-foreground">
        The slug and owner are fixed once this is created. Everything else stays
        editable.
      </p>

      <form
        className="flex max-w-170 flex-col gap-4"
        onSubmit={onSubmit}
      >
        <div className="flex flex-col gap-4.5 rounded-xl border border-border bg-card p-5">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium">Name</label>
            <Input
              {...register("name")}
              placeholder="Agent Name"
              className="h-9.5"
            />
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              Display string. Freely editable later.
            </p>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium">
              Slug
              <Lock className="size-3 text-muted-foreground" aria-hidden />
              <span className="text-[11.5px] font-normal text-muted-foreground">
                immutable after creation
              </span>
            </label>
            <Input
              value={slugValue}
              onChange={(event) => handleSlugChange(event.target.value)}
              placeholder="agent-slug"
              className={
                "h-9.5 font-mono " +
                (slugMessage.tone === "destructive"
                  ? "border-destructive"
                  : slugMessage.tone === "success"
                    ? "border-(--green-600)"
                    : "")
              }
            />
            <div
              className={
                "mt-1.5 flex items-center gap-1.5 text-[11.5px] " +
                (slugMessage.tone === "destructive"
                  ? "text-destructive"
                  : slugMessage.tone === "success"
                    ? "text-(--green-600)"
                    : "text-muted-foreground")
              }
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
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium">
              Groups
            </label>
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
            <div className="flex flex-wrap gap-1.5">
              {knownGroupNames
                .filter((groupName) => !groups.includes(groupName))
                .map((groupName) => (
                  <button
                    type="button"
                    key={groupName}
                    onClick={() => addGroup(groupName)}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 font-mono text-[11.5px] text-muted-foreground hover:bg-accent"
                  >
                    + {groupName}
                  </button>
                ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium">
              Persona
            </label>
            <Textarea
              {...register("persona")}
              placeholder="Describe how this agent should behave…"
              className="min-h-37.5 text-[13.5px] leading-relaxed"
            />
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              Saved as version 1. Later edits append new versions.
            </p>
          </div>

          <div className="flex items-center gap-2.5 border-t border-border pt-4 text-[12.5px] text-muted-foreground">
            <User className="size-3 shrink-0" aria-hidden />
            Owner will be{" "}
            <span className="font-mono text-foreground">{owner.ownerId}</span> —
            single-valued and fixed at registration.
          </div>
        </div>

        {submitError ? (
          <p className="text-sm text-destructive">{submitError}</p>
        ) : null}

        <div className="flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/agents")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canCreate}>
            {isSubmitting ? <Spinner className="size-3.5" aria-hidden /> : null}
            Create agent
          </Button>
        </div>
      </form>
    </>
  );
}

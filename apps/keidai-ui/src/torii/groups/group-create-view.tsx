import { Button, Input, Spinner, Textarea } from "@keidai/ui";
import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useSWRConfig } from "swr";
import { createGroup } from "../api/torii-client.js";
import { GROUPS_PATH } from "../../shell/navigation.js";
import { TORII_GROUPS_KEY } from "../../fuda/hooks/use-fetch-torii-groups.js";
import { GROUPS_KEY } from "./hooks/use-fetch-groups.js";
import { validateGroupName } from "./utils/validate-group-name.js";

export function GroupCreateView() {
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState(searchParams.get("name") ?? "");
  const [description, setDescription] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nameError = validateGroupName(name);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (nameError) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const group = await createGroup({
        name: name.trim(),
        description: description.trim(),
        servers: [],
      });
      await mutate(GROUPS_KEY);
      await mutate(TORII_GROUPS_KEY);
      void navigate(`${GROUPS_PATH}/${group.name}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Could not create group.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[640px]">
      <button
        type="button"
        onClick={() => navigate(GROUPS_PATH)}
        className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All groups
      </button>
      <div className="text-[23px] font-bold tracking-tight">New group</div>
      <p className="mt-1 text-[13.5px] text-muted-foreground">
        Name is the identifier agents join. You&apos;ll author the policy next.
      </p>

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-5 space-y-4">
        <div>
          <label className="text-[12.5px] font-medium" htmlFor="group-name">
            Name
          </label>
          <Input
            id="group-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="ops-write"
            className="mt-1.5 h-9 font-mono"
            autoComplete="off"
          />
          {name.trim() && nameError ? (
            <p className="mt-1.5 text-[12.5px] text-destructive">{nameError}</p>
          ) : (
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              Lowercase identifier. Immutable after create — it&apos;s the Fuda
              join key.
            </p>
          )}
        </div>
        <div>
          <label className="text-[12.5px] font-medium" htmlFor="group-desc">
            Description
          </label>
          <Textarea
            id="group-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Day-to-day write access for operations agents"
            className="mt-1.5 min-h-20"
          />
        </div>
        {submitError ? (
          <p className="text-sm text-destructive">{submitError}</p>
        ) : null}
        <Button type="submit" disabled={Boolean(nameError) || isSubmitting}>
          {isSubmitting ? <Spinner className="size-3.5" aria-hidden /> : null}
          Create group
        </Button>
      </form>
    </div>
  );
}

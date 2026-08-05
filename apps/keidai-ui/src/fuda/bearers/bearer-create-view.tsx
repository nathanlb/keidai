import { Button, Input, Spinner } from "@keidai/ui";
import { ArrowLeft, Circle, CircleCheckBig, Shield } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useSWRConfig } from "swr";
import { createBearer, grantBearer } from "../api/fuda-client.js";
import { useFetchAgents } from "../../shell/hooks/use-fetch-agents.js";
import {
  invalidateBearerCaches,
  invalidateGrantCaches,
} from "../hooks/invalidate-grant-caches.js";
import { generateBearerId } from "./utils/generate-bearer-id.js";

export function BearerCreateView() {
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const { data: agentsData } = useFetchAgents();
  const agents = useMemo(() => agentsData?.agents ?? [], [agentsData]);

  const [displayName, setDisplayName] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canRegister = displayName.trim().length > 0 && !isSubmitting;

  function toggleAgent(agentId: string) {
    setSelectedAgentIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canRegister) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const bearerId = generateBearerId();
      const { bearer } = await createBearer({
        bearerId,
        displayName: displayName.trim(),
      });

      for (const agentId of selectedAgentIds) {
        await grantBearer(bearer.bearerId, agentId);
        await invalidateGrantCaches(mutate, {
          bearerId: bearer.bearerId,
          agentId,
        });
      }

      await invalidateBearerCaches(mutate, bearer.bearerId);

      navigate(`/bearers/${encodeURIComponent(bearer.bearerId)}?tab=identity`, {
        state: {
          toast: `${bearer.bearerId} registered. Give that id to the Shaiden instance that should use it.`,
        },
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to register bearer",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 mb-3 text-muted-foreground"
        onClick={() => navigate("/bearers")}
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All bearers
      </Button>

      <div className="text-[23px] font-bold tracking-tight">New bearer</div>
      <p className="mb-5 mt-0.5 text-[13.5px] text-muted-foreground">
        Registers a named principal in Fuda. No credential is created — after
        save you&apos;ll get a{" "}
        <span className="font-mono text-[12.5px]">bearer_id</span> to hand to
        the process that should use it.
      </p>

      <form
        className="flex max-w-[680px] flex-col gap-4"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-4.5 rounded-xl border border-border bg-card p-5">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium">
              Display name
            </label>
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="github actions · ci"
              className="h-9.5"
            />
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              Name the process, not the person — this is what an operator reads
              in a trace. Editable later.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium">
              Grant agents{" "}
              <span className="text-[11.5px] font-normal text-muted-foreground">
                optional
              </span>
            </label>
            <div className="overflow-hidden rounded-md border border-border">
              {agents.length === 0 ? (
                <div className="px-3.5 py-3 text-[13px] text-muted-foreground">
                  No agents registered yet. You can grant later from either
                  side.
                </div>
              ) : (
                agents.map((agent, index) => {
                  const selected = selectedAgentIds.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => toggleAgent(agent.id)}
                      className={
                        "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-muted/45 " +
                        (index < agents.length - 1
                          ? "border-b border-border"
                          : "")
                      }
                    >
                      {selected ? (
                        <CircleCheckBig
                          className="size-[15px] shrink-0 text-(--green-600)"
                          aria-hidden
                        />
                      ) : (
                        <Circle
                          className="size-[15px] shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium">
                          {agent.name}
                        </div>
                        <div className="mt-px font-mono text-[11px] text-muted-foreground">
                          {agent.slug} ·{" "}
                          {agent.groups.length === 0
                            ? "no groups"
                            : agent.groups.join(", ")}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              Grants are many-to-many and reversible — skip this and add them
              from either side later.
            </p>
          </div>

          <div className="flex items-start gap-2.5 border-t border-border pt-4">
            <Shield
              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              After save, configure the Shaiden instance that should run as this
              bearer: give it the generated{" "}
              <span className="font-mono text-foreground">bearer_id</span> via
              its env.
            </p>
          </div>
        </div>

        {submitError ? (
          <p className="text-sm text-destructive">{submitError}</p>
        ) : null}

        <div className="flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/bearers")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canRegister}>
            {isSubmitting ? <Spinner className="size-3.5" aria-hidden /> : null}
            Register bearer
          </Button>
        </div>
      </form>
    </>
  );
}

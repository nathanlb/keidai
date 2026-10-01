import { Button } from "@keidai/ui";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { useSWRConfig } from "swr";
import { createAgent } from "../lib/api/agents.js";
import { AGENTS_KEY } from "../lib/hooks/use-fetch-agents.js";
import { useActingOwner } from "../shell/hooks/use-acting-owner.js";
import { AgentForm } from "./components/agent-form.js";
import type { CreateAgentFormValues } from "./schemas/create-agent-form-schema.js";

export function AgentAuthoringView() {
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const { owner } = useActingOwner();

  async function handleCreate(values: CreateAgentFormValues) {
    if (!owner) {
      return;
    }
    const { agent } = await createAgent({
      slug: values.slug.trim(),
      name: values.name.trim() || values.slug.trim(),
      ownerId: owner.ownerId,
      groups: values.groups,
      persona: values.persona,
      ...(values.modelId.trim()
        ? { defaultModelId: values.modelId.trim() }
        : {}),
      ...(values.emoji ? { emoji: values.emoji } : {}),
    });
    await mutate(AGENTS_KEY);
    navigate(`/agents/${agent.id}`, {
      state: {
        toast: "Agent created. Shaiden can run it.",
      },
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2 text-muted-foreground"
        onClick={() => navigate("/agents")}
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All agents
      </Button>

      <div className="text-[23px] font-bold tracking-tight">New agent</div>
      <p className="mt-0.5 mb-5 text-[13.5px] text-muted-foreground">
        The slug and owner are fixed once this is created. Everything else stays
        editable.
      </p>

      <AgentForm
        mode="create"
        onSubmit={handleCreate}
        onCancel={() => navigate("/agents")}
      />
    </>
  );
}

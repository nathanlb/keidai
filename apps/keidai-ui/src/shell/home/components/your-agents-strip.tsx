import { Badge, cn } from "@keidai/ui";
import { Link } from "react-router";
import { AGENTS_PATH } from "../../navigation.js";
import type { HomeAgentCard, HomeAgentHealth } from "../types/home-digest.js";

function healthDotClass(health: HomeAgentHealth): string {
  switch (health) {
    case "healthy":
      return "bg-(--green-600)";
    case "failing":
      return "bg-destructive";
    case "idle":
      return "bg-muted-foreground";
  }
}

export function YourAgentsStrip({
  agents,
}: {
  agents: readonly HomeAgentCard[];
}) {
  if (agents.length === 0) {
    return null;
  }

  return (
    <section data-testid="home-agents">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[13.5px] font-semibold">Your agents</span>
        <Link
          to={AGENTS_PATH}
          className="ml-auto text-[12.5px] text-muted-foreground no-underline hover:text-foreground"
        >
          All agents →
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {agents.map((agent) => (
          <Link
            key={agent.id}
            to={`${AGENTS_PATH}/${encodeURIComponent(agent.id)}`}
            className="rounded-xl border border-border bg-card px-[15px] py-3.5 no-underline transition-colors duration-150 ease-out hover:bg-accent motion-reduce:transition-none"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-secondary font-mono text-[11.5px] font-bold text-secondary-foreground">
                {agent.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold text-foreground">
                  {agent.name}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {agent.slug}
                </div>
              </div>
              <span
                className={cn(
                  "size-[7px] shrink-0 rounded-full",
                  healthDotClass(agent.health),
                )}
                aria-hidden
              />
            </div>
            <p className="mt-[11px] text-xs leading-normal text-muted-foreground">
              {agent.summary}
            </p>
            <div className="mt-[11px] flex flex-wrap gap-1.5">
              <Badge
                variant="secondary"
                className="rounded-full px-2 py-0.5 font-mono text-[11px] font-normal"
              >
                {agent.taskLabel}
              </Badge>
              <Badge
                variant="secondary"
                className="rounded-full px-2 py-0.5 font-mono text-[11px] font-normal"
              >
                {agent.toolLabel}
              </Badge>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

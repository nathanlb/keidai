import { Card, CardContent } from "@keidai/ui";

const RULES = [
  {
    n: "1",
    nClass: "text-destructive",
    lead: "The deny rule applies first.",
    rest: "If one group denies a tool, the agent cannot use that tool, even if another group permits that tool.",
  },
  {
    n: "2",
    nClass: "text-amber-500",
    lead: "A gated tool is permitted.",
    rest: "The tool waits for approval before it runs.",
  },
  {
    n: "3",
    nClass: "text-muted-foreground",
    lead: "The groups add their permissions.",
    rest: "If an agent is in more than one group, the agent can use all the tools that these groups permit.",
  },
] as const;

export function HowThisResolves() {
  return (
    <Card className="shadow-none">
      <CardContent className="px-3.75 py-3.5">
        <div className="mb-2.5 text-[13px] font-semibold">
          How these rules apply
        </div>
        <div className="flex flex-col gap-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
          {RULES.map((rule) => (
            <div key={rule.n} className="flex gap-2">
              <span className={`shrink-0 font-mono ${rule.nClass}`}>
                {rule.n}
              </span>
              <span>
                <span className="text-foreground">{rule.lead}</span> {rule.rest}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

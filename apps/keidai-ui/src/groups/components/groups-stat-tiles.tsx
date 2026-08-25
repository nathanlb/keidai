import { Card, CardContent, cn } from "@keidai/ui";

function StatTile({
  label,
  value,
  dotClass,
}: {
  label: string;
  value: string;
  dotClass: string;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="px-3.75 py-3.25">
        <div className="
          flex items-center gap-1.5 text-[12px] text-muted-foreground
        ">
          <span
            className={cn("size-1.75 shrink-0 rounded-full", dotClass)}
            aria-hidden
          />
          {label}
        </div>
        <div className="
          mt-1.5 text-[22px] leading-none font-bold tracking-tight
        ">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export function GroupsStatTiles({
  servers,
  allowed,
  gated,
  agents,
}: {
  servers: number;
  allowed: number;
  gated: number;
  agents: number;
}) {
  return (
    <div className="
      grid grid-cols-2 gap-3
      md:grid-cols-4
    ">
      <StatTile
        label="Servers"
        value={String(servers)}
        dotClass="bg-muted-foreground"
      />
      <StatTile
        label="Tools allowed"
        value={String(allowed)}
        dotClass="bg-(--green-600)"
      />
      <StatTile
        label="Need approval"
        value={String(gated)}
        dotClass="bg-amber-500"
      />
      <StatTile
        label="Agents affected"
        value={String(agents)}
        dotClass="bg-chart-1"
      />
    </div>
  );
}

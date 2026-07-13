import { cn } from "@keidai/ui";
import type { ServiceHealth } from "../../types/service-health.js";
import { useGatewayStatus } from "../../hooks/use-gateway-status.js";
import { useShaidenStatus } from "../../hooks/use-shaiden-status.js";

function formatServiceMeta(status: ServiceHealth): string {
  const parts = [
    status.version ? `v${status.version}` : null,
    status.displayAddress || null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : "—";
}

interface ServiceHealthRowProps {
  name: string;
  status: ServiceHealth;
}

function ServiceHealthRow({ name, status }: ServiceHealthRowProps) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          status.healthy ? "bg-success" : "bg-destructive",
        )}
        aria-hidden
      />
      <div className="min-w-0 leading-snug">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[12.5px] font-semibold text-sidebar-foreground">
            {name}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {status.label}
          </span>
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          {formatServiceMeta(status)}
        </div>
      </div>
    </div>
  );
}

export function BackendHealthFooter() {
  const { status: torii } = useGatewayStatus();
  const { status: shaiden } = useShaidenStatus();

  return (
    <div className="m-2 flex flex-col gap-2.5 border-t border-sidebar-border p-2.5">
      <ServiceHealthRow name="Torii" status={torii} />
      <ServiceHealthRow name="Shaiden" status={shaiden} />
    </div>
  );
}

/** @deprecated Use BackendHealthFooter */
export const GatewayHealthFooter = BackendHealthFooter;

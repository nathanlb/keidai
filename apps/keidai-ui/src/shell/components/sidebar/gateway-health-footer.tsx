import { useGatewayStatus } from "../../hooks/use-gateway-status.js";

export function GatewayHealthFooter() {
  const { status } = useGatewayStatus();

  return (
    <div className="m-2 flex items-center gap-2 border-t border-sidebar-border p-2.5">
      <span
        className={
          status.healthy
            ? "size-2 shrink-0 rounded-full bg-success"
            : "size-2 shrink-0 rounded-full bg-destructive"
        }
        aria-hidden
      />
      <div className="min-w-0 leading-snug">
        <div className="text-[12.5px] font-semibold text-sidebar-foreground">
          {status.label}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">
          v{status.version} · {status.displayAddress || "—"}
        </div>
      </div>
    </div>
  );
}

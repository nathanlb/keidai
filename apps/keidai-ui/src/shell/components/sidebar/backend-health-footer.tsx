import { useRef, useState, type FocusEvent } from "react";
import { cn } from "@keidai/ui";
import type { ServiceHealth } from "../../../lib/types/service-health.js";
import { useFudaStatus } from "../../../lib/hooks/use-fuda-status.js";
import { useToriiStatus } from "../../../lib/hooks/use-torii-status.js";
import { useShaidenStatus } from "../../../lib/hooks/use-shaiden-status.js";

type ServiceStatusKind = "healthy" | "degraded" | "down";

interface EcosystemService {
  key: string;
  name: string;
  status: ServiceHealth;
  testId: string;
}

function getServiceStatusKind(status: ServiceHealth): ServiceStatusKind {
  if (status.healthy) {
    return "healthy";
  }

  if (status.label === "Unreachable") {
    return "down";
  }

  return "degraded";
}

const statusColorClass: Record<ServiceStatusKind, string> = {
  healthy: "bg-success",
  degraded: "bg-warning",
  down: "bg-destructive",
};

const statusTextClass: Record<ServiceStatusKind, string> = {
  healthy: "text-success",
  degraded: "text-warning",
  down: "text-destructive",
};

function formatServiceMeta(status: ServiceHealth): string {
  const version = status.version ? `v${status.version}` : "—";
  const address = status.displayAddress || "—";
  return `${version} · ${address}`;
}

function formatSegmentAriaLabel(service: EcosystemService): string {
  return `${service.name}, ${service.status.label}, ${formatServiceMeta(service.status)}`;
}

interface StatusPopoverProps {
  service: EcosystemService;
  kind: ServiceStatusKind;
}

function StatusPopover({ service, kind }: StatusPopoverProps) {
  return (
    <div
      className="pointer-events-none absolute inset-x-2.5 bottom-[calc(100%-2px)] z-[5] flex flex-col gap-[5px] rounded-[9px] border border-border bg-popover px-[11px] py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
      data-testid="backend-health-popover"
    >
      <div className="flex items-center gap-[7px]">
        <span
          className={cn("size-1.5 shrink-0 rounded-full", statusColorClass[kind])}
          aria-hidden
        />
        <span className="text-[12.5px] font-semibold text-popover-foreground">
          {service.name}
        </span>
        <span
          className={cn(
            "ml-auto text-[11px] font-medium",
            statusTextClass[kind],
          )}
        >
          {service.status.label}
        </span>
      </div>
      <div className="font-mono text-[11px] leading-[1.45] text-muted-foreground">
        {formatServiceMeta(service.status)}
      </div>
    </div>
  );
}

interface ServiceSegmentProps {
  service: EcosystemService;
  kind: ServiceStatusKind;
  isHovered: boolean;
  onHover: () => void;
  onBlur: (event: FocusEvent<HTMLButtonElement>) => void;
}

function ServiceSegment({
  service,
  kind,
  isHovered,
  onHover,
  onBlur,
}: ServiceSegmentProps) {
  const labelColor =
    kind === "healthy"
      ? isHovered
        ? "text-sidebar-foreground"
        : "text-muted-foreground"
      : statusTextClass[kind];

  return (
    <button
      type="button"
      data-testid={service.testId}
      className="flex flex-1 cursor-default flex-col justify-end gap-[7px] border-0 bg-transparent p-0 pb-0.5 text-left"
      aria-label={formatSegmentAriaLabel(service)}
      onMouseEnter={onHover}
      onFocus={onHover}
      onBlur={onBlur}
    >
      <span className="flex h-[5px] items-end">
        <span
          className={cn(
            "w-full rounded-[3px] transition-[height] duration-150 ease-in-out",
            statusColorClass[kind],
            isHovered ? "h-[5px]" : "h-[3px]",
          )}
        />
      </span>
      <span
        className={cn(
          "font-mono text-[10.5px] tracking-[0.02em] transition-colors duration-150 ease-in-out",
          labelColor,
        )}
      >
        {service.key}
      </span>
    </button>
  );
}

export function BackendHealthFooter() {
  const footerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  const { status: torii } = useToriiStatus();
  const { status: fuda } = useFudaStatus();
  const { status: shaiden } = useShaidenStatus();

  const services: EcosystemService[] = [
    { key: "torii", name: "Torii", status: torii, testId: "backend-health-torii" },
    { key: "fuda", name: "Fuda", status: fuda, testId: "backend-health-fuda" },
    {
      key: "shaiden",
      name: "Shaiden",
      status: shaiden,
      testId: "backend-health-shaiden",
    },
  ];

  const upCount = services.filter((service) => service.status.healthy).length;
  const hoveredService = hoveredIndex >= 0 ? services[hoveredIndex] : null;
  const hoveredKind = hoveredService
    ? getServiceStatusKind(hoveredService.status)
    : null;

  const handleSegmentBlur = (event: FocusEvent<HTMLButtonElement>) => {
    const next = event.relatedTarget;
    if (!footerRef.current?.contains(next as Node | null)) {
      setHoveredIndex(-1);
    }
  };

  return (
    <div
      ref={footerRef}
      className="relative flex flex-col gap-2 border-t border-sidebar-border p-2.5"
      data-testid="backend-health-footer"
      onMouseLeave={() => setHoveredIndex(-1)}
    >
      {hoveredService && hoveredKind ? (
        <StatusPopover service={hoveredService} kind={hoveredKind} />
      ) : null}

      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-medium text-sidebar-foreground">
          Ecosystem
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {upCount}/{services.length} up
        </span>
      </div>

      <div className="flex gap-[3px]">
        {services.map((service, index) => (
          <ServiceSegment
            key={service.key}
            service={service}
            kind={getServiceStatusKind(service.status)}
            isHovered={hoveredIndex === index}
            onHover={() => setHoveredIndex(index)}
            onBlur={handleSegmentBlur}
          />
        ))}
      </div>
    </div>
  );
}

import type { ReactNode } from "react";

export function FieldHeader({
  icon,
  label,
  required,
  badge,
}: {
  icon: ReactNode;
  label: string;
  required?: boolean;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex text-muted-foreground">{icon}</span>
      <span className="text-[13.5px] font-semibold">{label}</span>
      {required ? (
        <span className="text-[11px] text-destructive">required</span>
      ) : null}
      {badge}
    </div>
  );
}

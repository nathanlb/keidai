import { cn } from "@keidai/ui";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";

export function TriggerChip({
  selected,
  disabled,
  icon,
  label,
  onClick,
}: {
  selected?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        `
          flex flex-1 items-center gap-2 rounded-md px-3 py-2.5 text-left
          text-[13px]
        `,
        selected
          ? "border border-ring bg-primary/10 font-semibold"
          : "border border-border text-muted-foreground",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="inline-flex shrink-0">{icon}</span>
      <span>{label}</span>
      {disabled ? (
        <Lock className="ml-auto size-3 shrink-0" aria-hidden />
      ) : selected ? (
        <span
          className="
            ml-auto size-4 shrink-0 rounded-full border-[5px] border-primary
          "
          aria-hidden
        />
      ) : (
        <span
          className="ml-auto size-4 shrink-0 rounded-full border border-border"
          aria-hidden
        />
      )}
    </button>
  );
}

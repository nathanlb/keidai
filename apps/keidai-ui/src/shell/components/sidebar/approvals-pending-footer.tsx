import { cn } from "@keidai/ui";

interface NavPendingBadgeProps {
  count: number;
}

export function NavPendingBadge({ count }: NavPendingBadgeProps) {
  if (count === 0) {
    return null;
  }

  return (
    <span
      className={cn(
        "ml-auto inline-flex min-w-4.75 items-center justify-center rounded-full",
        "bg-amber-500 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-950",
      )}
    >
      {count}
    </span>
  );
}

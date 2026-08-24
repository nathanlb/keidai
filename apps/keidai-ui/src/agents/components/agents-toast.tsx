import { Check } from "lucide-react";

export interface AgentsToastProps {
  message: string | null;
}

/** Bottom-center pill toast — no external toast library, matches the design handoff. */
export function AgentsToast({ message }: AgentsToastProps) {
  if (!message) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-popover px-4 py-2.5 text-[13px] text-popover-foreground shadow-lg">
        <Check className="size-3.5 shrink-0 text-(--green-600)" aria-hidden />
        {message}
      </div>
    </div>
  );
}

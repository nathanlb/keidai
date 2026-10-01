import { cn } from "@keidai/ui";
import { OwnerAvatar } from "../../shell/components/owner-avatar/owner-avatar.js";

/** Small table/drawer avatar: the agent emoji when set, otherwise initials. */
export function AgentAvatar({
  emoji,
  initials,
  className,
}: {
  emoji?: string | null;
  initials: string;
  className?: string;
}) {
  return (
    <OwnerAvatar
      initials={emoji || initials}
      className={cn(
        "size-5.5 shrink-0 bg-secondary text-secondary-foreground",
        emoji ? "text-xs" : "text-[9px]",
        className,
      )}
    />
  );
}

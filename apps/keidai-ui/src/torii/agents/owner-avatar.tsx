import { cn } from "@keidai/ui";

interface OwnerAvatarProps {
  initials: string;
  className?: string;
}

export function OwnerAvatar({ initials, className }: OwnerAvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-medium text-primary-foreground select-none",
        className,
      )}
    >
      {initials}
    </span>
  );
}

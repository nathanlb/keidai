import { Avatar, AvatarFallback, cn } from "@keidai/ui";

interface OwnerAvatarProps {
  initials: string;
  className?: string;
  size?: "default" | "sm" | "lg";
}

export function OwnerAvatar({
  initials,
  className,
  size = "default",
}: OwnerAvatarProps) {
  return (
    <Avatar
      size={size}
      className={cn("bg-primary text-primary-foreground", className)}
    >
      <AvatarFallback className="bg-primary text-[length:inherit] text-primary-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

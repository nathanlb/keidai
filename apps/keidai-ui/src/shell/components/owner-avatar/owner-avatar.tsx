import { Avatar, AvatarFallback, AvatarImage, cn } from "@keidai/ui";

interface OwnerAvatarProps {
  initials: string;
  picture?: string;
  className?: string;
  size?: "default" | "sm" | "lg";
}

export function OwnerAvatar({
  initials,
  picture,
  className,
  size = "default",
}: OwnerAvatarProps) {
  return (
    <Avatar
      size={size}
      className={cn("bg-primary text-primary-foreground", className)}
    >
      {picture ? <AvatarImage src={picture} alt="" /> : null}
      <AvatarFallback className="
        bg-primary text-[length:inherit] text-primary-foreground
      ">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@keidai/ui";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { useActingOwner } from "../../hooks/use-acting-owner.js";
import { OwnerAvatar } from "../owner-avatar/owner-avatar.js";

export function OwnerSwitcher() {
  const { owner } = useActingOwner();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-8 gap-2 rounded-full py-0.5 pr-2 pl-1"
        >
          <OwnerAvatar
            initials={owner.initials}
            size="sm"
            className="size-6 text-[10px]"
          />
          <span className="text-[13px] font-medium">{owner.ownerId}</span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[236px]">
        <DropdownMenuLabel>Acting owner</DropdownMenuLabel>
        <DropdownMenuItem className="gap-2">
          <OwnerAvatar
            initials={owner.initials}
            size="sm"
            className="size-[22px] text-[10px]"
          />
          {owner.ownerId}
          <Check className="ml-auto size-[15px] text-success" />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="gap-2">
          <UserPlus className="size-[15px] text-muted-foreground" />
          Add owner
        </DropdownMenuItem>
        <div className="px-2 pt-1.5 pb-0.5 text-[11px] leading-snug text-muted-foreground">
          Single owner in v0. Connect an IdP to manage multiple owners — each
          agent stays bound to one owner (strict ownership).
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

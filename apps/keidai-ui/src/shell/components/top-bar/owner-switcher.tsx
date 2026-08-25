import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@keidai/ui";
import { Check, ChevronsUpDown, LogOut } from "lucide-react";
import { useActingOwner } from "../../hooks/use-acting-owner.js";
import { useOperatorSession } from "../../hooks/use-operator-session.js";
import { OwnerAvatar } from "../owner-avatar/owner-avatar.js";

export function OwnerSwitcher() {
  const { owner } = useActingOwner();
  const { status, principal } = useOperatorSession();

  if (!owner) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="
            h-8 gap-2 rounded-full px-1 py-0.5
            sm:pr-2
          "
        >
          <OwnerAvatar
            initials={owner.initials}
            picture={owner.picture}
            size="sm"
            className="size-6 text-[10px]"
          />
          <span
            className="
            hidden text-[13px] font-medium
            sm:inline
          "
          >
            {owner.displayName}
          </span>
          <ChevronsUpDown
            className="
            hidden size-3.5 text-muted-foreground
            sm:block
          "
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuLabel>Signed in</DropdownMenuLabel>
        <DropdownMenuItem className="gap-2">
          <OwnerAvatar
            initials={owner.initials}
            picture={owner.picture}
            size="sm"
            className="size-5.5 text-[10px]"
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{owner.displayName}</span>
            <span
              className="
              truncate font-mono text-[11px] text-muted-foreground
            "
            >
              {owner.ownerId}
            </span>
          </span>
          <Check className="ml-auto size-3.75 shrink-0 text-success" />
        </DropdownMenuItem>
        {status === "authenticated" ? (
          <>
            <DropdownMenuSeparator />
            {principal?.email ? (
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                {principal.email}
              </div>
            ) : null}
            <form method="post" action="/auth/logout">
              <DropdownMenuItem asChild className="gap-2">
                <button type="submit">
                  <LogOut className="size-3.75 text-muted-foreground" />
                  Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </>
        ) : (
          <div
            className="
            px-2 pt-1.5 pb-0.5 text-[11px] leading-snug text-muted-foreground
          "
          >
            Operators are mapped 1:1 from Google identities in operators.yaml.
            Each agent stays bound to one opaque owner id.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

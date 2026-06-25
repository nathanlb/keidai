import { cn } from "@keidai/ui";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useActingOwner } from "../../hooks/use-acting-owner.js";

function OwnerAvatar({ className, children }: { className?: string; children: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-medium text-primary-foreground select-none",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function OwnerSwitcher() {
  const { owner } = useActingOwner();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex h-8 cursor-pointer items-center gap-2 rounded-full border border-border bg-background py-0.5 pr-2 pl-1 text-foreground transition-colors hover:bg-accent"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <OwnerAvatar className="size-6 text-[10px]">{owner.initials}</OwnerAvatar>
        <span className="text-[13px] font-medium">{owner.ownerId}</span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute top-[38px] right-0 z-40 min-w-[236px] animate-in rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md fade-in-0 zoom-in-95"
        >
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Acting owner
          </div>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
          >
            <OwnerAvatar className="size-[22px] text-[10px]">
              {owner.initials}
            </OwnerAvatar>
            {owner.ownerId}
            <Check className="ml-auto size-[15px] text-success" />
          </button>
          <div className="-mx-1 my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:text-muted-foreground"
            disabled
          >
            <UserPlus className="size-[15px] text-muted-foreground" />
            Add owner
          </button>
          <div className="px-2 pt-1.5 pb-0.5 text-[11px] leading-snug text-muted-foreground">
            Single owner in v0. Connect an IdP to manage multiple owners — each
            agent stays bound to one owner (strict ownership).
          </div>
        </div>
      ) : null}
    </div>
  );
}

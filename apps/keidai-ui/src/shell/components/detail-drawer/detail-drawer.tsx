import {
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  cn,
} from "@keidai/ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headerBadge?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footerLeading?: ReactNode;
  bodyClassName?: string;
}

export function DetailDrawer({
  open,
  onOpenChange,
  headerBadge,
  title,
  description,
  children,
  footerLeading,
  bodyClassName,
}: DetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full max-w-[560px] flex-col gap-0 p-0 sm:max-w-[560px]"
      >
        <SheetHeader className="space-y-0 border-b border-border px-5 py-[18px] text-left">
          <div className="flex items-start gap-3 pr-8">
            {headerBadge}
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base">{title}</SheetTitle>
              {description ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  {description}
                </div>
              ) : null}
            </div>
            <SheetClose className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </SheetClose>
          </div>
        </SheetHeader>

        <div
          className={cn(
            "flex-1 overflow-y-auto px-5 py-[18px]",
            bodyClassName,
          )}
        >
          {children}
        </div>

        <SheetFooter
          className={cn(
            "flex-row border-t border-border px-5 py-3.5",
            footerLeading
              ? "justify-between sm:justify-between"
              : "justify-end sm:justify-end",
          )}
        >
          {footerLeading ?? null}
          <SheetClose asChild>
            <Button type="button">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function DetailDrawerSectionLabel({
  children,
  hint,
}: {
  children: string;
  hint?: string;
}) {
  return (
    <div className="mb-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
      {hint ? (
        <span className="ml-1 font-medium tracking-normal text-muted-foreground normal-case">
          · {hint}
        </span>
      ) : null}
    </div>
  );
}

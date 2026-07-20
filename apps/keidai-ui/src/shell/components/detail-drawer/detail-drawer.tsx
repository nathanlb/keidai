import {
  Button,
  Separator,
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  cn,
} from "@keidai/ui";
import { X } from "lucide-react";
import { useCallback, useState, type PointerEvent, type ReactNode } from "react";

const DEFAULT_DRAWER_WIDTH = 560;
const MIN_DRAWER_WIDTH = 360;
const MAX_DRAWER_WIDTH = 1200;

function clampDrawerWidth(width: number) {
  const maxWidth = Math.min(MAX_DRAWER_WIDTH, window.innerWidth - 48);
  return Math.min(maxWidth, Math.max(MIN_DRAWER_WIDTH, width));
}

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
  const [width, setWidth] = useState(DEFAULT_DRAWER_WIDTH);

  const startResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = width;

      const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        setWidth(clampDrawerWidth(startWidth + delta));
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        document.body.style.removeProperty("user-select");
        document.body.style.removeProperty("cursor");
      };

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [width],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={{ width }}
        className="flex h-full max-w-none flex-col gap-0 p-0 sm:max-w-none"
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize drawer"
          className="absolute inset-y-0 left-0 z-20 w-1.5 -translate-x-1/2 cursor-col-resize touch-none before:absolute before:inset-y-0 before:-left-1.5 before:w-4 hover:bg-border/80 active:bg-border"
          onPointerDown={startResize}
        />

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

        <Separator />
        <SheetFooter
          className={cn(
            "flex-row px-5 py-3.5",
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

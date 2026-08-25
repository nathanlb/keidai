import { Sheet, SheetContent, SheetTitle } from "@keidai/ui";
import { SidebarPanel, type SidebarPanelProps } from "./sidebar.js";

interface SidebarDrawerProps extends SidebarPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SidebarDrawer({
  open,
  onOpenChange,
  onNavInteract,
  ...panelProps
}: SidebarDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id="shell-nav-drawer"
        side="left"
        className="
          flex h-full w-62 max-w-[85vw] flex-col gap-0 border-sidebar-border
          bg-sidebar p-0 text-sidebar-foreground
          sm:max-w-62
        "
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarPanel
          {...panelProps}
          onNavInteract={(event) => {
            onNavInteract?.(event);
            if ((event.target as HTMLElement).closest("a")) {
              onOpenChange(false);
            }
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

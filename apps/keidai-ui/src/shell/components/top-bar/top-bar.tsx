import { Button } from "@keidai/ui";
import { Menu } from "lucide-react";
import { useShellUi } from "../../hooks/use-shell-ui.js";
import type { AppShellBreadcrumb } from "../../types/index.js";
import { OwnerSwitcher } from "./owner-switcher.js";
import { ThemeToggle } from "./theme-toggle.js";
import { Breadcrumb } from "./breadcrumb.js";

interface TopBarProps {
  breadcrumb: AppShellBreadcrumb;
  showNavButton?: boolean;
}

export function TopBar({ breadcrumb, showNavButton = false }: TopBarProps) {
  const { navOpen, toggleNav } = useShellUi();

  return (
    <div className="box-border flex h-[58px] shrink-0 items-center justify-between gap-3 border-b border-border px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {showNavButton ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            onClick={toggleNav}
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={navOpen}
            aria-controls="shell-nav-drawer"
          >
            <Menu className="size-4" />
          </Button>
        ) : null}

        <Breadcrumb breadcrumb={breadcrumb} />
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <ThemeToggle />
        <OwnerSwitcher />
      </div>
    </div>
  );
}

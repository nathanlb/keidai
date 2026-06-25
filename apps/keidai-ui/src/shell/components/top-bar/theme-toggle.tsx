import { Button } from "@keidai/ui";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../hooks/use-theme.js";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-8 text-muted-foreground"
      onClick={toggleTheme}
      aria-label={
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
    >
      {theme === "dark" ? (
        <Sun className="size-[15px]" />
      ) : (
        <Moon className="size-[15px]" />
      )}
    </Button>
  );
}

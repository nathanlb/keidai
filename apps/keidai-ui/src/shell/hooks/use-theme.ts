import { useAppContext } from "../context/app-context.js";

export type { Theme, ThemePalette } from "../context/slices/theme-slice.js";

export function useTheme() {
  const { theme, toggleTheme, palette, setPalette } = useAppContext();
  return { theme, toggleTheme, palette, setPalette };
}

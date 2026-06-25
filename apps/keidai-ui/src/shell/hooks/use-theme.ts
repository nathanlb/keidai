import { useAppContext } from "../context/app-context.js";

export type { Theme } from "../context/slices/theme-slice.js";

export function useTheme() {
  const { theme, toggleTheme } = useAppContext();
  return { theme, toggleTheme };
}

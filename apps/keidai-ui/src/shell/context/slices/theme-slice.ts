export type Theme = "light" | "dark";

export const themeStorageKey = "keidai-ui-theme";

export interface ThemeState {
  theme: Theme;
}

export type ThemeAction =
  | { type: "theme/set"; theme: Theme }
  | { type: "theme/toggle" };

export function readStoredTheme(): Theme {
  const stored = localStorage.getItem(themeStorageKey);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return "dark";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

const initialTheme = readStoredTheme();
applyTheme(initialTheme);

export const initialThemeState: ThemeState = {
  theme: initialTheme,
};

export function themeReducer(state: ThemeState, action: ThemeAction): ThemeState {
  switch (action.type) {
    case "theme/set":
      return { theme: action.theme };
    case "theme/toggle":
      return { theme: state.theme === "dark" ? "light" : "dark" };
    default:
      return state;
  }
}

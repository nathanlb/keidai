export type Theme = "light" | "dark";
export type ThemePalette = "default" | "platinum";

export const themeStorageKey = "keidai-ui-theme";
export const themePaletteStorageKey = "keidai-ui-theme-palette";

export interface ThemeState {
  theme: Theme;
  palette: ThemePalette;
}

export type ThemeAction =
  | { type: "theme/set"; theme: Theme }
  | { type: "theme/toggle" }
  | { type: "theme/setPalette"; palette: ThemePalette };

export function readStoredTheme(): Theme {
  const stored = localStorage.getItem(themeStorageKey);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return "dark";
}

export function readStoredThemePalette(): ThemePalette {
  const stored = localStorage.getItem(themePaletteStorageKey);
  if (stored === "default" || stored === "platinum") {
    return stored;
  }
  return "default";
}

export function applyTheme(
  theme: Theme,
  palette: ThemePalette = readStoredThemePalette(),
): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle(
    "theme-platinum",
    palette === "platinum",
  );
}

const initialTheme = readStoredTheme();
const initialPalette = readStoredThemePalette();
applyTheme(initialTheme, initialPalette);

export const initialThemeState: ThemeState = {
  theme: initialTheme,
  palette: initialPalette,
};

export function themeReducer(
  state: ThemeState,
  action: ThemeAction,
): ThemeState {
  switch (action.type) {
    case "theme/set":
      return { ...state, theme: action.theme };
    case "theme/toggle":
      return {
        ...state,
        theme: state.theme === "dark" ? "light" : "dark",
      };
    case "theme/setPalette":
      return { ...state, palette: action.palette };
    default:
      return state;
  }
}

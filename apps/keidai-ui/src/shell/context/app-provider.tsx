import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { SWRConfig } from "swr";
import { AppContext, type AppContextValue } from "./app-context.js";
import {
  initialShellUiState,
  shellUiReducer,
} from "./slices/shell-ui-slice.js";
import {
  applyTheme,
  initialThemeState,
  themePaletteStorageKey,
  themeReducer,
  themeStorageKey,
  type ThemePalette,
} from "./slices/theme-slice.js";

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [themeState, themeDispatch] = useReducer(
    themeReducer,
    initialThemeState,
  );
  const [shellUiState, shellUiDispatch] = useReducer(
    shellUiReducer,
    initialShellUiState,
  );

  useEffect(() => {
    applyTheme(themeState.theme, themeState.palette);
    localStorage.setItem(themeStorageKey, themeState.theme);
    localStorage.setItem(themePaletteStorageKey, themeState.palette);
  }, [themeState.theme, themeState.palette]);

  const toggleTheme = useCallback(() => {
    themeDispatch({ type: "theme/toggle" });
  }, []);

  const setPalette = useCallback((palette: ThemePalette) => {
    themeDispatch({ type: "theme/setPalette", palette });
  }, []);

  const setNavOpen = useCallback((navOpen: boolean) => {
    shellUiDispatch({ type: "shell-ui/setNavOpen", navOpen });
  }, []);

  const toggleNav = useCallback(() => {
    shellUiDispatch({ type: "shell-ui/toggleNav" });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      theme: themeState.theme,
      toggleTheme,
      palette: themeState.palette,
      setPalette,
      navOpen: shellUiState.navOpen,
      setNavOpen,
      toggleNav,
    }),
    [
      themeState.theme,
      toggleTheme,
      themeState.palette,
      setPalette,
      shellUiState.navOpen,
      setNavOpen,
      toggleNav,
    ],
  );

  return (
    <SWRConfig value={{ dedupingInterval: 2_000 }}>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </SWRConfig>
  );
}

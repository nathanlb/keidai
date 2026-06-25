import { createContext, useContext } from "react";
import type { Theme } from "./slices/theme-slice.js";

export interface AppContextValue {
  theme: Theme;
  toggleTheme: () => void;
  navOpen: boolean;
  setNavOpen: (navOpen: boolean) => void;
  toggleNav: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return value;
}

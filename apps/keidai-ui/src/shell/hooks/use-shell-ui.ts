import { useAppContext } from "../context/app-context.js";

export function useShellUi() {
  const { navOpen, setNavOpen, toggleNav } = useAppContext();
  return { navOpen, setNavOpen, toggleNav };
}

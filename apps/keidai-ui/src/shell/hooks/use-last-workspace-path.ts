import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { resolveNavMode } from "../navigation.js";
import {
  readLastWorkspacePath,
  writeLastWorkspacePath,
} from "../utils/last-workspace-path.js";

export function useLastWorkspacePath(): string {
  const location = useLocation();
  const [lastPath, setLastPath] = useState(readLastWorkspacePath);

  useEffect(() => {
    if (resolveNavMode(location.pathname) !== "workspace") {
      return;
    }

    const href = `${location.pathname}${location.search}`;
    writeLastWorkspacePath(href);
    setLastPath(href);
  }, [location.pathname, location.search]);

  return lastPath;
}

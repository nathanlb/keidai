import { HOME_PATH, resolveNavMode } from "../navigation.js";

export const LAST_WORKSPACE_PATH_KEY = "keidai.lastWorkspacePath";
export const DEFAULT_WORKSPACE_PATH = HOME_PATH;

export function readLastWorkspacePath(): string {
  try {
    const stored = sessionStorage.getItem(LAST_WORKSPACE_PATH_KEY);
    if (!stored || !stored.startsWith("/") || stored.startsWith("//")) {
      return DEFAULT_WORKSPACE_PATH;
    }
    if (resolveNavMode(stored.split("?")[0] ?? stored) === "configure") {
      return DEFAULT_WORKSPACE_PATH;
    }
    return stored;
  } catch {
    return DEFAULT_WORKSPACE_PATH;
  }
}

export function writeLastWorkspacePath(href: string): void {
  if (!href.startsWith("/") || href.startsWith("//")) {
    return;
  }
  if (resolveNavMode(href.split("?")[0] ?? href) === "configure") {
    return;
  }

  try {
    sessionStorage.setItem(LAST_WORKSPACE_PATH_KEY, href);
  } catch {
    // Private mode / quota — last-workspace is a fallback, not required.
  }
}

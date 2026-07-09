import { findShaidenNavItem } from "../shaiden/navigation.js";
import { findToriiNavItem } from "../torii/navigation.js";

export type AppNavItem = NonNullable<
  ReturnType<typeof findToriiNavItem> | ReturnType<typeof findShaidenNavItem>
>;

export function resolveAppNav(pathname: string): AppNavItem | undefined {
  return findShaidenNavItem(pathname) ?? findToriiNavItem(pathname);
}

export function resolveAppSection(pathname: string): string {
  return findShaidenNavItem(pathname) ? "Shaiden" : "Torii";
}

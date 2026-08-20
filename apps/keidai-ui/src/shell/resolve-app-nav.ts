import { findFudaNavItem, isFudaManagedRoute } from "../fuda/navigation.js";
import { findShaidenNavItem } from "../shaiden/navigation.js";
import { findToriiNavItem } from "../torii/navigation.js";

export type AppNavItem = NonNullable<
  | ReturnType<typeof findToriiNavItem>
  | ReturnType<typeof findShaidenNavItem>
  | ReturnType<typeof findFudaNavItem>
>;

export function resolveAppNav(pathname: string): AppNavItem | undefined {
  return (
    findShaidenNavItem(pathname) ??
    findFudaNavItem(pathname) ??
    findToriiNavItem(pathname)
  );
}

export function resolveAppSection(pathname: string): string {
  if (findShaidenNavItem(pathname)) {
    return "Shaiden";
  }
  if (findFudaNavItem(pathname) || isFudaManagedRoute(pathname)) {
    return "Fuda";
  }
  return "Torii";
}

export type RouteGroup = "public" | "agent" | "management";

export const ALL_ROUTE_GROUPS: readonly RouteGroup[] = [
  "public",
  "agent",
  "management",
] as const;

export function isRouteGroup(value: string): value is RouteGroup {
  return (ALL_ROUTE_GROUPS as readonly string[]).includes(value);
}

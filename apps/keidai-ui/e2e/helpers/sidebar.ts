import type { Page } from "@playwright/test";

export type SidebarNavSection = "torii" | "shaiden";

export function sidebarNav(page: Page) {
  return page.getByTestId("sidebar-nav");
}

export function sidebarNavSection(page: Page, section: SidebarNavSection) {
  return sidebarNav(page).getByTestId(`sidebar-nav-section-${section}`);
}

export function sidebarNavLink(page: Page, path: string) {
  const slug = path.replace(/^\//, "").replace(/\//g, "-");
  return sidebarNav(page).getByTestId(`sidebar-nav-link-${slug}`);
}

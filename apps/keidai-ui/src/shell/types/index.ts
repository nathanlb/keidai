export interface AppShellBreadcrumbSegment {
  label: string;
  href?: string;
}

export interface AppShellBreadcrumb {
  section: string;
  /** Final crumb shown in foreground when `segments` is omitted. */
  page: string;
  /**
   * Optional trail after `section`. Last segment is emphasized; earlier ones
   * are muted (e.g. Torii › Connections › detail).
   */
  segments?: AppShellBreadcrumbSegment[];
}

export interface AppShellPageHeader {
  title: string;
  description: string;
  configChip?: string;
  /** Defaults to true. Set false for authoring screens without a refresh action. */
  showRefresh?: boolean;
}

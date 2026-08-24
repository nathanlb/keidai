export function formatOAuthUrlDisplay(url: string | undefined): string {
  if (!url) {
    return "—";
  }

  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

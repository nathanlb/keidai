/** Coarse relative age ("today" / "3d ago" / "2mo ago"), matching activity trace copy. */
export function formatRelativeTime(
  timestamp: string,
  now: number = Date.now(),
): string {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) {
    return "—";
  }

  const days = Math.floor(Math.max(0, now - then) / 86_400_000);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 30) {
    return `${days}d ago`;
  }
  return `${Math.round(days / 30)}mo ago`;
}

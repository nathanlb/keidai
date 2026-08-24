export function formatParkedDuration(parkedAtIso: string, now = Date.now()): string {
  const parkedAt = Date.parse(parkedAtIso);
  if (Number.isNaN(parkedAt)) {
    return "—";
  }

  const elapsedMs = Math.max(0, now - parkedAt);
  const totalMinutes = Math.floor(elapsedMs / 60_000);

  if (totalMinutes < 1) {
    return "<1m";
  }
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

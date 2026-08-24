/** Compact parked/elapsed labels: `38s`, `4m`, `2m 14s`, `1h 20m`. */
export function formatCompactDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainderSeconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    if (remainderSeconds === 0) {
      return `${totalMinutes}m`;
    }
    return `${totalMinutes}m ${remainderSeconds}s`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const remainderMinutes = totalMinutes % 60;
  if (remainderMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainderMinutes}m`;
}

export function formatCompactDurationSince(
  timestamp: string,
  now: number,
): string {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) {
    return "—";
  }
  return formatCompactDuration(Math.max(0, now - then));
}

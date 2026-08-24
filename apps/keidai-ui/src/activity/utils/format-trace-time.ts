const clockFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatRelativeAge(timestamp: string, now = Date.now()): string {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) {
    return "—";
  }

  const deltaMs = Math.max(0, now - then);
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatTraceClock(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return clockFormatter.format(date);
}

export function formatTraceRelative(timestamp: string): string {
  return formatRelativeAge(timestamp);
}

export function formatDurationMs(durationMs?: number): string {
  if (durationMs === undefined) {
    return "—";
  }
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  return `${(durationMs / 1000).toFixed(2)} s`;
}

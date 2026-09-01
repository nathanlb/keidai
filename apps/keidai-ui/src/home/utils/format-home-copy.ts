export function firstLine(text: string, maxLength = 80): string {
  const line = text.split(/\r?\n/).find((part) => part.trim()) ?? "";
  const trimmed = line.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

export function formatHomeSubtitle(
  attentionCount: number,
  runningCount: number,
): string {
  if (attentionCount > 0) {
    const noun = attentionCount === 1 ? "thing wants" : "things want";
    return `${attentionCount} ${noun} your decision. Everything else is running.`;
  }
  const runNoun = runningCount === 1 ? "run" : "runs";
  return `Nothing is blocked. ${runningCount} ${runNoun} in flight.`;
}

export function formatItemCount(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}

export function formatAgentCount(count: number): string {
  return count === 1 ? "1 agent" : `${count} agents`;
}

export function formatTaskCount(count: number): string {
  return count === 1 ? "1 task" : `${count} tasks`;
}

export function formatToolCount(count: number): string {
  return count === 1 ? "1 tool" : `${count} tools`;
}

export function formatPartialSub(count: number): string {
  return count === 1 ? "1 partial" : `${count} partial`;
}

export function formatOldestParkedSub(label: string): string {
  return label === "—" ? "none parked" : `oldest ${label}`;
}

export function formatRecentFooter(shown: number, total: number): string {
  return `Showing ${shown} of ${total} runs.`;
}

export function formatScheduledFooter(
  total: number,
  paused: number,
  failed = 0,
): string {
  const taskPart =
    total === 1 ? "1 task on a trigger" : `${total} tasks on a trigger`;
  const extras = [
    paused > 0 ? `${paused} paused` : null,
    failed > 0 ? `${failed} failed` : null,
  ].filter((part): part is string => part !== null);
  if (extras.length === 0) {
    return taskPart;
  }
  return `${taskPart} · ${extras.join(" · ")}.`;
}

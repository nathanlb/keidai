export function formatGoalPreview(goal: string, maxLength = 120): string {
  const flattened = goal.replace(/\s+/g, " ").trim();
  return flattened.length > maxLength
    ? `${flattened.slice(0, maxLength)}…`
    : flattened;
}

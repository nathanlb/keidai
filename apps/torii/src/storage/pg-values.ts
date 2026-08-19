export function toEpochMs(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export function parseJsonValue<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

export function parseJsonValueOrNull<T>(
  value: T | string | null,
): T | undefined {
  if (value === null) {
    return undefined;
  }
  return parseJsonValue(value);
}

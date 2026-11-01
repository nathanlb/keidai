/** MCP `_meta` key for Torii call metadata on `CallToolResult`. */
export const TORII_CALL_META_KEY = "io.keidai/torii" as const;

/** Policy outcome Torii can report without the caller joining on a trace. */
export const TORII_CALL_DECISIONS = [
  "allowed",
  "denied",
  "linking-required",
  "approval-required",
] as const;

export type ToriiCallDecision = (typeof TORII_CALL_DECISIONS)[number];

export interface ToriiCallMeta {
  traceId: string;
  /**
   * Absent on meta written before the decision was recorded. `durationMs` is
   * the backend round-trip and is absent when the call never reached one.
   */
  decision?: ToriiCallDecision;
  durationMs?: number;
}

export function readToriiCallMeta(value: unknown): ToriiCallMeta | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.traceId !== "string" || record.traceId.length === 0) {
    return undefined;
  }
  const decision = TORII_CALL_DECISIONS.find(
    (item) => item === record.decision,
  );
  const durationMs =
    typeof record.durationMs === "number" &&
    Number.isFinite(record.durationMs) &&
    record.durationMs >= 0
      ? Math.trunc(record.durationMs)
      : undefined;
  return {
    traceId: record.traceId,
    ...(decision ? { decision } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

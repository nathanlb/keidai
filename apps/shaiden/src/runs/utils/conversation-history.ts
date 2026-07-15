import type { RunStep, TerminationOutcome } from "@keidai/shared";
import type { ConversationEntry } from "../../run/types/conversation-history.js";

export type BeginContinuationFailureReason =
  | "not_found"
  | "not_terminal"
  | "ineligible_outcome"
  | "missing_history"
  | "concurrent_continuation";

export type BeginContinuationResult =
  | { ok: true; history: ConversationEntry[] }
  | { ok: false; reason: BeginContinuationFailureReason };

const ELIGIBLE_CONTINUATION_OUTCOMES = new Set<TerminationOutcome["status"]>([
  "failed",
  "goal_met",
  "iteration_exhausted",
  "timeout",
]);

export function isEligibleContinuationOutcome(
  outcome: TerminationOutcome | undefined,
): outcome is TerminationOutcome {
  return outcome !== undefined && ELIGIBLE_CONTINUATION_OUTCOMES.has(outcome.status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isModelToolCall(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.toolCallId === "string" &&
    typeof value.toolName === "string" &&
    isRecord(value.input)
  );
}

function parseConversationEntry(value: unknown): ConversationEntry | null {
  if (!isRecord(value) || typeof value.role !== "string") {
    return null;
  }

  switch (value.role) {
    case "user":
      return typeof value.text === "string"
        ? { role: "user", text: value.text }
        : null;
    case "assistant":
      if (typeof value.text !== "string" || !Array.isArray(value.toolCalls)) {
        return null;
      }
      if (!value.toolCalls.every(isModelToolCall)) {
        return null;
      }
      return {
        role: "assistant",
        text: value.text,
        toolCalls: value.toolCalls as ConversationEntry & {
          role: "assistant";
        } extends { toolCalls: infer T }
          ? T
          : never,
      };
    case "tool":
      if (
        typeof value.toolCallId !== "string" ||
        typeof value.toolName !== "string" ||
        typeof value.output !== "string"
      ) {
        return null;
      }
      return {
        role: "tool",
        toolCallId: value.toolCallId,
        toolName: value.toolName,
        output: value.output,
        ...(value.isError === true ? { isError: true } : {}),
      };
    default:
      return null;
  }
}

export function parseConversationHistory(
  json: string | null | undefined,
): ConversationEntry[] | null {
  if (!json) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null;
  }

  const entries: ConversationEntry[] = [];
  for (const item of parsed) {
    const entry = parseConversationEntry(item);
    if (!entry) {
      return null;
    }
    entries.push(entry);
  }

  return entries;
}

export function serializeConversationHistory(
  history: readonly ConversationEntry[],
): string {
  return JSON.stringify(history);
}

export function appendUserMessageToHistory(
  history: readonly ConversationEntry[],
  message: string,
): ConversationEntry[] {
  return [...history, { role: "user", text: message }];
}

export function createUserMessageStep(text: string): {
  timestamp: string;
  kind: "user_message";
  text: string;
} {
  return {
    timestamp: new Date().toISOString(),
    kind: "user_message",
    text,
  };
}

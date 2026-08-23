import type { ConversationEntry } from "./types/conversation-history.js";
import type { ModelToolCall } from "./types/task-loop.js";

/** Model-facing tool result written when a run is stopped mid-flight. */
export const RUN_STOPPED_TOOL_OUTPUT = "cancelled: run stopped";

/** Tool calls on the latest assistant turn that do not yet have a tool result. */
export function findUnansweredToolCalls(
  history: readonly ConversationEntry[],
): ModelToolCall[] {
  const answered = new Set(
    history
      .filter(
        (entry): entry is Extract<ConversationEntry, { role: "tool" }> =>
          entry.role === "tool",
      )
      .map((entry) => entry.toolCallId),
  );

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry?.role !== "assistant") {
      continue;
    }
    return entry.toolCalls.filter((call) => !answered.has(call.toolCallId));
  }

  return [];
}

/**
 * Append synthetic error results for unanswered tool calls so resume does not
 * violate "every tool call has a result."
 */
export function closeUnansweredToolCalls(
  history: ConversationEntry[],
): void {
  for (const call of findUnansweredToolCalls(history)) {
    history.push({
      role: "tool",
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      output: RUN_STOPPED_TOOL_OUTPUT,
      isError: true,
    });
  }
}

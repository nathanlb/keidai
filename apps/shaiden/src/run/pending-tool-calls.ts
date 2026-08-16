import type { ConversationEntry } from "./types/conversation-history.js";
import type { ModelToolCall } from "./types/task-loop.js";

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

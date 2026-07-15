import type { ModelToolCall } from "./task-loop.js";

/** Provider-agnostic conversation history persisted for run continuations. */
export type ConversationEntry =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ModelToolCall[] }
  | {
      role: "tool";
      toolCallId: string;
      toolName: string;
      output: string;
      isError?: boolean;
    };

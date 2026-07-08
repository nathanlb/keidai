import {
  generateText,
  jsonSchema,
  type JSONSchema7,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import type { DiscoveredTool } from "../mcp/types/index.js";
import type { ConversationEntry, ModelStep } from "./types/task-loop.js";

const EMPTY_INPUT_SCHEMA: JSONSchema7 = { type: "object", properties: {} };

/**
 * Torii-discovered tools become model-visible tool definitions without an
 * `execute` function, so the model emits tool calls but the loop owns
 * dispatching them to Torii.
 */
export function buildToolSet(tools: DiscoveredTool[]): ToolSet {
  const toolSet: ToolSet = {};
  for (const tool of tools) {
    toolSet[tool.name] = {
      description: tool.description,
      inputSchema: jsonSchema(
        (tool.inputSchema as JSONSchema7 | undefined) ?? EMPTY_INPUT_SCHEMA,
      ),
    };
  }
  return toolSet;
}

function toModelMessages(history: ConversationEntry[]): ModelMessage[] {
  return history.map((entry): ModelMessage => {
    switch (entry.role) {
      case "user":
        return { role: "user", content: entry.text };
      case "assistant":
        return {
          role: "assistant",
          content: [
            ...(entry.text ? [{ type: "text" as const, text: entry.text }] : []),
            ...entry.toolCalls.map((call) => ({
              type: "tool-call" as const,
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              input: call.input,
            })),
          ],
        };
      case "tool":
        return {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: entry.toolCallId,
              toolName: entry.toolName,
              output: { type: "text", value: entry.output },
            },
          ],
        };
    }
  });
}

/** Wrap one single-step generateText call as the loop's callModel dependency. */
export function createModelStepCaller(
  model: LanguageModel,
  system: string,
  tools: ToolSet,
): (history: ConversationEntry[]) => Promise<ModelStep> {
  return async (history) => {
    const result = await generateText({
      model,
      system,
      messages: toModelMessages(history),
      tools,
    });

    return {
      text: result.text,
      toolCalls: result.toolCalls.map((call) => ({
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: (call.input ?? {}) as Record<string, unknown>,
      })),
    };
  };
}

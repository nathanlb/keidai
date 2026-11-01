import {
  generateText,
  jsonSchema,
  zodSchema,
  type JSONSchema7,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { readOpenRouterCost } from "../model/openrouter.js";
import type { DiscoveredTool } from "../mcp/types/index.js";
import {
  parseStepAssessment,
  REPORT_STEP_ASSESSMENT_DESCRIPTION,
  REPORT_STEP_ASSESSMENT_TOOL,
  resolveModelStepAssessment,
  stepAssessmentSchema,
} from "./step-assessment.js";
import {
  EXECUTE_PYTHON_DESCRIPTION,
  EXECUTE_PYTHON_TOOL,
  executePythonSchema,
} from "../sandbox/execute-python.js";
import {
  REPORT_TASK_OUTPUT_DESCRIPTION,
  REPORT_TASK_OUTPUT_TOOL,
  isHarnessLocalTool,
  taskOutputSchema,
} from "./task-output.js";
import type { ConversationEntry, ModelStep } from "./types/task-loop.js";

const EMPTY_INPUT_SCHEMA: JSONSchema7 = { type: "object", properties: {} };

/**
 * Torii-discovered tools become model-visible tool definitions without an
 * `execute` function, so the model emits tool calls but the loop owns
 * dispatching them to Torii.
 */
export function buildToolSet(
  tools: DiscoveredTool[],
  options?: { sandbox?: boolean },
): ToolSet {
  const toolSet: ToolSet = {
    [REPORT_STEP_ASSESSMENT_TOOL]: {
      description: REPORT_STEP_ASSESSMENT_DESCRIPTION,
      inputSchema: zodSchema(stepAssessmentSchema),
    },
    [REPORT_TASK_OUTPUT_TOOL]: {
      description: REPORT_TASK_OUTPUT_DESCRIPTION,
      inputSchema: zodSchema(taskOutputSchema),
    },
  };
  if (options?.sandbox) {
    toolSet[EXECUTE_PYTHON_TOOL] = {
      description: EXECUTE_PYTHON_DESCRIPTION,
      inputSchema: zodSchema(executePythonSchema),
    };
  }

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
            ...(entry.text
              ? [{ type: "text" as const, text: entry.text }]
              : []),
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
              output: entry.isError
                ? { type: "error-text", value: entry.output }
                : { type: "text", value: entry.output },
            },
          ],
        };
    }
  });
}

/** Token, cost, and resolved-model fields taken from one generateText result. */
export function modelCallAccounting(input: {
  usage: { inputTokens?: number; outputTokens?: number };
  response: { modelId?: string; body?: unknown };
}): Pick<
  ModelStep,
  "inputTokens" | "outputTokens" | "cost" | "resolvedModelId"
> {
  const cost = readOpenRouterCost(input.response.body);
  const resolvedModelId = input.response.modelId?.trim();
  return {
    ...(typeof input.usage.inputTokens === "number" &&
    Number.isFinite(input.usage.inputTokens) &&
    input.usage.inputTokens >= 0
      ? { inputTokens: input.usage.inputTokens }
      : {}),
    ...(typeof input.usage.outputTokens === "number" &&
    Number.isFinite(input.usage.outputTokens) &&
    input.usage.outputTokens >= 0
      ? { outputTokens: input.usage.outputTokens }
      : {}),
    ...(cost != null ? { cost } : {}),
    ...(resolvedModelId ? { resolvedModelId } : {}),
  };
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

    const assessmentCall = result.toolCalls.find(
      (call) => call.toolName === REPORT_STEP_ASSESSMENT_TOOL,
    );
    const toolCalls = result.toolCalls
      .filter((call) => call.toolName !== REPORT_STEP_ASSESSMENT_TOOL)
      .map((call) => ({
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: (call.input ?? {}) as Record<string, unknown>,
      }));

    // Only Torii tools suppress an explicit terminal assessment. Output may
    // share a turn with report_step_assessment. Output alone must continue —
    // do not invent cannot_complete from accompanying narration.
    const toriiToolCalls = toolCalls.filter(
      (call) => !isHarnessLocalTool(call.toolName),
    );

    const assessment = resolveModelStepAssessment(
      parseStepAssessment(assessmentCall?.input),
      toriiToolCalls,
      result.text,
      toolCalls,
    );

    return {
      text: assessment?.message || result.text,
      toolCalls,
      ...(assessment ? { assessment } : {}),
      ...modelCallAccounting(result),
    };
  };
}

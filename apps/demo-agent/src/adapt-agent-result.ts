import type { GenerateTextResult, StepResult, ToolSet } from "ai";
import type { DigestResult } from "./assertions.js";

export interface AgentStepSnapshot {
  text: string;
  finishReason: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  toolCalls: Array<{ toolName: string; input?: unknown }>;
  toolResults: Array<{
    type: string;
    error?: unknown;
    output?: unknown;
  }>;
}

/** Snapshot of an AI SDK agent `generate()` result used by scenario logging and assertions. */
export interface AgentGenerateSnapshot {
  text: string;
  finishReason: string;
  warnings?: unknown[];
  totalUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  responseBody?: unknown;
  steps: AgentStepSnapshot[];
}

function snapshotStepToolResults(
  step: StepResult<ToolSet>,
): AgentStepSnapshot["toolResults"] {
  const results: AgentStepSnapshot["toolResults"] = [];

  for (const part of step.content) {
    if (part.type === "tool-result") {
      results.push({
        type: "tool-result",
        output: part.output,
      });
      continue;
    }

    if (part.type === "tool-error") {
      results.push({
        type: "tool-error",
        error: part.error,
      });
    }
  }

  return results;
}

function snapshotStep(step: StepResult<ToolSet>): AgentStepSnapshot {
  return {
    text: step.text,
    finishReason: step.finishReason,
    usage: step.usage,
    toolCalls: step.toolCalls.map((toolCall) => ({
      toolName: toolCall.toolName,
      input: toolCall.input,
    })),
    toolResults: snapshotStepToolResults(step),
  };
}

export function toAgentSnapshot(
  result: GenerateTextResult<ToolSet, never>,
): AgentGenerateSnapshot {
  return {
    text: result.text,
    finishReason: result.finishReason,
    warnings: result.warnings,
    totalUsage: result.totalUsage,
    responseBody: result.response.body,
    steps: result.steps.map(snapshotStep),
  };
}

export function toDigestResult(result: AgentGenerateSnapshot): DigestResult {
  return {
    text: result.text,
    steps: result.steps.map((step) => ({
      toolCalls: step.toolCalls.map((toolCall) => ({
        toolName: toolCall.toolName,
      })),
      toolResults: step.toolResults.map((toolResult) => ({
        type: toolResult.type,
        error: toolResult.type === "tool-error" ? toolResult.error : undefined,
      })),
    })),
  };
}

/** Final-step text is often empty when the model ends on a tool-call step. */
export function extractDisplayedText(result: AgentGenerateSnapshot): string {
  if (result.text.trim()) {
    return result.text;
  }

  const stepTexts = result.steps
    .map((step) => step.text.trim())
    .filter((text) => text.length > 0);

  if (stepTexts.length === 0) {
    return result.text;
  }

  return stepTexts.sort((left, right) => right.length - left.length)[0] ?? result.text;
}

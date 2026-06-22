import type { GenerateTextOnStepFinishCallback, ToolSet } from "ai";
import type { AgentGenerateSnapshot } from "./adapt-agent-result.js";
import { toDigestResult } from "./adapt-agent-result.js";
import { collectToolCallNames } from "./assertions.js";

const MAX_LOG_CHARS = 2_000;

function truncate(value: unknown): string {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (text.length <= MAX_LOG_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_LOG_CHARS)}… [truncated ${text.length - MAX_LOG_CHARS} chars]`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return truncate(error);
}

function formatTokenUsage(usage?: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): string {
  if (!usage) {
    return "tokens=?";
  }
  return `tokens in=${usage.inputTokens ?? "?"} out=${usage.outputTokens ?? "?"} total=${usage.totalTokens ?? "?"}`;
}

export function createAgentStepLogger(
  label: string | (() => string),
  options: { verbose: boolean },
): GenerateTextOnStepFinishCallback<ToolSet> {
  let stepNumber = 0;
  let lastLabel = "";
  const resolveLabel = () => (typeof label === "string" ? label : label());

  return (step) => {
    const resolvedLabel = resolveLabel();
    if (resolvedLabel !== lastLabel) {
      stepNumber = 0;
      lastLabel = resolvedLabel;
    }
    stepNumber += 1;
    const toolNames =
      step.toolCalls.map((toolCall) => toolCall.toolName).join(", ") || "(none)";

    console.log(
      `[agent:${resolvedLabel}] step ${stepNumber} finishReason=${step.finishReason} tools=${toolNames} text=${step.text.length}ch ${formatTokenUsage(step.usage)}`,
    );

    const toolErrors = step.content.filter((part) => part.type === "tool-error");
    for (const part of toolErrors) {
      console.error(
        `[agent:${resolvedLabel}] tool error ${part.toolName}: ${formatError(part.error)}`,
      );
    }

    if (step.warnings?.length) {
      console.warn(
        `[agent:${resolvedLabel}] provider warnings:`,
        truncate(step.warnings),
      );
    }

    if (!options.verbose) {
      if (
        step.text.length === 0 &&
        step.toolCalls.length === 0 &&
        step.finishReason !== "tool-calls"
      ) {
        console.warn(
          `[agent:${resolvedLabel}] step ${stepNumber} produced no text and no tool calls (finishReason=${step.finishReason})`,
        );
      }
      return;
    }

    if (step.text.trim()) {
      console.log(`[agent:${resolvedLabel}] assistant text:\n${truncate(step.text)}\n`);
    }

    for (const part of step.content) {
      if (part.type === "tool-call") {
        console.log(
          `[agent:${resolvedLabel}] tool call ${part.toolName} input=${truncate(part.input)}`,
        );
        continue;
      }

      if (part.type === "tool-result") {
        console.log(
          `[agent:${resolvedLabel}] tool result ${part.toolName} output=${truncate(part.output)}`,
        );
      }
    }
  };
}

export function logAgentRunSummary(
  label: string,
  snapshot: AgentGenerateSnapshot,
): void {
  const toolNames = collectToolCallNames(toDigestResult(snapshot));
  const stepSummaries = snapshot.steps.map((step, index) => {
    const stepTools =
      step.toolCalls.map((toolCall) => toolCall.toolName).join(", ") || "(none)";
    return `  step ${index + 1}: finishReason=${step.finishReason} tools=${stepTools} text=${step.text.length}ch`;
  });

  console.log(
    `[agent:${label}] run complete: steps=${snapshot.steps.length} finishReason=${snapshot.finishReason} toolCalls=${toolNames.length} finalText=${snapshot.text.length}ch ${formatTokenUsage(snapshot.totalUsage)}`,
  );

  if (stepSummaries.length > 0) {
    console.log(`[agent:${label}] step summary:\n${stepSummaries.join("\n")}`);
  }

  if (toolNames.length > 0) {
    console.log(`[agent:${label}] all tool calls: ${toolNames.join(", ")}`);
  }

  if (snapshot.warnings?.length) {
    console.warn(
      `[agent:${label}] run warnings:`,
      truncate(snapshot.warnings),
    );
  }

  if (snapshot.finishReason === "length") {
    console.warn(
      `[agent:${label}] model stopped due to output length limit; response may be truncated`,
    );
  }

  if (snapshot.text.length === 0) {
    const stepsWithText = snapshot.steps.filter((step) => step.text.trim().length > 0);
    if (stepsWithText.length > 0) {
      console.warn(
        `[agent:${label}] final text is empty but ${stepsWithText.length} earlier step(s) had assistant text; using longest step text for display`,
      );
    } else {
      console.warn(`[agent:${label}] final text is empty across all steps`);
    }
  }

  if (toolNames.length === 0) {
    console.warn(`[agent:${label}] no tool calls were made during this run`);
    if (snapshot.responseBody !== undefined) {
      console.warn(
        `[agent:${label}] provider response body:`,
        truncate(snapshot.responseBody),
      );
    }
  }
}

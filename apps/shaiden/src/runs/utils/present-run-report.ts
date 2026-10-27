import type { OutcomeRunStep, RunReport, RunStep } from "@keidai/shared";
import type { ConversationEntry } from "../../run/types/conversation-history.js";

function clip(value: string, maxLength: number): string {
  const flattened = value.replace(/\s+/g, " ").trim();
  return flattened.length > maxLength
    ? `${flattened.slice(0, maxLength)}…`
    : flattened;
}

function timestampAt(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) {
    return new Date(0).toISOString();
  }
  return new Date(start).toISOString();
}

function outcomeStep(
  run: Pick<RunReport, "id" | "outcome">,
  timestamp: string,
): OutcomeRunStep | undefined {
  if (!run.outcome) {
    return undefined;
  }

  return {
    id: `${run.id}:history:outcome`,
    timestamp,
    kind: "outcome",
    outcomeStatus: run.outcome.status,
    ...(run.outcome.status === "failed"
      ? { outcomeReason: run.outcome.reason }
      : {}),
  };
}

/**
 * Rebuild a display log from persisted conversation history. Used when step
 * rows have aged out of `KEIDAI_PARTITION_RETENTION_DAYS` while the run row
 * is still listed.
 */
export function stepsFromConversationHistory(
  run: Pick<RunReport, "id" | "startedAt" | "outcome">,
  history: readonly ConversationEntry[],
): RunStep[] {
  const steps: RunStep[] = [];
  const timestamp = timestampAt(run.startedAt);
  let userMessages = 0;

  history.forEach((entry, index) => {
    const id = `${run.id}:history:${index}`;

    if (entry.role === "user") {
      userMessages += 1;
      if (userMessages === 1) {
        return;
      }
      steps.push({
        id,
        timestamp,
        kind: "user_message",
        text: entry.text,
      });
      return;
    }

    if (entry.role === "assistant") {
      if (entry.text || entry.toolCalls.length > 0) {
        steps.push({
          id: `${id}:model`,
          timestamp,
          kind: "model",
          ...(entry.text ? { text: clip(entry.text, 500) } : {}),
        });
      }
      for (const call of entry.toolCalls) {
        steps.push({
          id: `${id}:dispatch:${call.toolCallId}`,
          timestamp,
          kind: "tool_dispatch",
          toolName: call.toolName,
          toolCallId: call.toolCallId,
          inputPreview: clip(JSON.stringify(call.input), 200),
        });
      }
      return;
    }

    steps.push({
      id: `${id}:result`,
      timestamp,
      kind: "tool_result",
      toolName: entry.toolName,
      toolCallId: entry.toolCallId,
      status: entry.isError ? "error" : "ok",
      charCount: entry.output.length,
      outputPreview: clip(entry.output, entry.isError ? 500 : 200),
    });
  });

  const outcome = outcomeStep(run, timestamp);
  if (outcome) {
    steps.push(outcome);
  }

  return steps;
}

export function presentRunReport(
  run: RunReport,
  history: readonly ConversationEntry[] | null,
): RunReport {
  if (
    run.steps.length > 0 ||
    run.stepCount === 0 ||
    !history ||
    history.length === 0
  ) {
    return run;
  }

  const steps = stepsFromConversationHistory(run, history);
  if (steps.length === 0) {
    return run;
  }

  return { ...run, steps };
}

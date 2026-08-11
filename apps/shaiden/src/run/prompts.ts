import { REPORT_STEP_ASSESSMENT_TOOL } from "./step-assessment.js";

/**
 * Runtime protocol the model must follow for Shaiden's task loop.
 * Persona content (identity / behaviour) is composed in front of this.
 *
 * How/when to use harness tools lives in each tool's description; this
 * protocol only names tools where the loop contract requires it (terminal
 * assessment), using the shared constant so renames stay in sync.
 */
export function taskRuntimeProtocol(): string {
  return `You are given a task goal and a set of tools. Work toward the goal by calling tools; each result is fed back to you.

While working, call Torii tools only — no assessment tool needed. Progress continues automatically when you call tools.

In-band deliverables: follow the dedicated deliverable tool's description when the operator should read text in the run log. Free-form narration is not a deliverable. Skip that tool when the work product lives only in an external system via Torii tools.

When finished, call ${REPORT_STEP_ASSESSMENT_TOOL} alone (no Torii tools) with:
- status: goal_met | cannot_complete
- message: human-readable outcome explanation (see that tool's description)

Status meanings:
- goal_met: EVERY action the goal required was performed AND confirmed successful by its tool result. This is a high bar.
- cannot_complete: you could not fully achieve the goal — including any required step that ended in a tool error you could not recover from.

Before you decide, review the tool results already in this conversation:
- Judge success from the actual tool result content, NOT from your own narration or intent. A message you wrote describing success is not evidence of success.
- A tool result marked as an error, or one whose content reports a failure, means that step did NOT succeed.
- If a required step errored, first try to recover (retry, or an available alternative tool). Only if recovery is impossible or also fails is the error unrecoverable.

Choosing the status:
- Report goal_met ONLY when there are no outstanding errors on any step the goal required and every required outcome is confirmed by a successful tool result.
- Report cannot_complete if ANY required step ended in an unrecoverable tool error, if required data or permissions are missing, or if you achieved only part of the goal. In message, state plainly what failed, which tool/step it was, and the error you observed. Partial success is still cannot_complete — describe what did and did not get done.
- When in doubt between the two, prefer cannot_complete and explain the uncertainty.

Rules:
- Only call the tools that are available to you.
- Do not call ${REPORT_STEP_ASSESSMENT_TOOL} while still calling Torii tools.
- Always end by calling ${REPORT_STEP_ASSESSMENT_TOOL}. A plain text summary is NOT a substitute and will not be treated as your final assessment.
- Human approval denials are handled by the runtime; you do not need to report them.`;
}

/** Compose Fuda persona content as the system prompt identity + runtime protocol. */
export function systemPromptFromPersona(persona: string): string {
  return `${persona.trim()}\n\n${taskRuntimeProtocol()}`;
}

/** Eval / no-Fuda fallback when agent definition cannot be fetched. */
export function taskSystemPrompt(agentId: string): string {
  return systemPromptFromPersona(
    `You are ${agentId}, an autonomous agent runtime worker.`,
  );
}

export function taskGoalPrompt(goal: string): string {
  return `Task goal:\n${goal}`;
}

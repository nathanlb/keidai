import { createHash } from "node:crypto";
import {
  TORII_APPROVAL_ID_ARG,
  TORII_RUN_ID_ARG,
  TORII_STEP_ID_ARG,
  type AgentPrincipal,
} from "@keidai/shared";

export interface ParsedToolArguments {
  upstreamArgs: Record<string, unknown>;
  approvalId?: string;
  /** Opaque correlation ref — stored/echoed only. */
  runId?: string;
  /** Opaque correlation ref — stored/echoed only. */
  stepId?: string;
}

export function parseToolArguments(
  args: Record<string, unknown> | undefined,
): ParsedToolArguments {
  if (!args) {
    return { upstreamArgs: {} };
  }

  const upstreamArgs = { ...args };
  const approvalId =
    typeof upstreamArgs[TORII_APPROVAL_ID_ARG] === "string"
      ? upstreamArgs[TORII_APPROVAL_ID_ARG]
      : undefined;
  const runId =
    typeof upstreamArgs[TORII_RUN_ID_ARG] === "string"
      ? upstreamArgs[TORII_RUN_ID_ARG]
      : undefined;
  const stepId =
    typeof upstreamArgs[TORII_STEP_ID_ARG] === "string"
      ? upstreamArgs[TORII_STEP_ID_ARG]
      : undefined;

  delete upstreamArgs[TORII_APPROVAL_ID_ARG];
  delete upstreamArgs[TORII_RUN_ID_ARG];
  delete upstreamArgs[TORII_STEP_ID_ARG];

  return { upstreamArgs, approvalId, runId, stepId };
}

export function hashToolParams(params: Record<string, unknown>): string {
  return createHash("sha256")
    .update(stableStringify(params))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function isGatedToolForAgent(
  principal: AgentPrincipal | undefined,
  gatedToolsByAgentId: ReadonlyMap<string, readonly string[]>,
  toolName: string,
): boolean {
  if (!principal) {
    return false;
  }

  const gatedTools = gatedToolsByAgentId.get(principal.agentId);
  return gatedTools?.includes(toolName) ?? false;
}

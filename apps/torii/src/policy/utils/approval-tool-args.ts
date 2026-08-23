import { createHash } from "node:crypto";
import {
  TORII_RUN_ID_ARG,
  TORII_STEP_ID_ARG,
} from "@keidai/shared";

export interface ParsedToolArguments {
  upstreamArgs: Record<string, unknown>;
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
  const runId =
    typeof upstreamArgs[TORII_RUN_ID_ARG] === "string"
      ? upstreamArgs[TORII_RUN_ID_ARG]
      : undefined;
  const stepId =
    typeof upstreamArgs[TORII_STEP_ID_ARG] === "string"
      ? upstreamArgs[TORII_STEP_ID_ARG]
      : undefined;

  delete upstreamArgs[TORII_RUN_ID_ARG];
  delete upstreamArgs[TORII_STEP_ID_ARG];

  return { upstreamArgs, runId, stepId };
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

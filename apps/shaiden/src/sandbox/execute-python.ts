import { z } from "zod";

/** Harness-local tool. Shaiden supplies runId; the model never does. */
export const EXECUTE_PYTHON_TOOL = "execute_python";

export const EXECUTE_PYTHON_SOURCE_MAX = 100_000;
export const EXECUTE_PYTHON_TIMEOUT_MAX_SECONDS = 120;

export const EXECUTE_PYTHON_DESCRIPTION =
  "Run Python in this run's private workspace. The standard library only: no network and no package installs. Files you write stay for later execute_python calls in this same run; every process is killed when the call returns. Use it to compute, transform data, or inspect files from an earlier call in this run. Do not use it for Torii tools or for anything that must outlive the run.";

export const EXECUTE_PYTHON_PROTOCOL_NOTE =
  "execute_python is available. Its workspace files persist until this run ends, including across an approval wait. Processes do not persist. It has no network.";

export const executePythonSchema = z.object({
  source: z
    .string()
    .min(1)
    .max(EXECUTE_PYTHON_SOURCE_MAX)
    .describe("Python source to execute. stdin is not available."),
  timeoutSeconds: z
    .number()
    .int()
    .min(1)
    .max(EXECUTE_PYTHON_TIMEOUT_MAX_SECONDS)
    .optional()
    .describe(
      "Wall-clock limit for this call. The runtime kills the process at the cap.",
    ),
});

export type ExecutePythonInput = z.infer<typeof executePythonSchema>;

export function parseExecutePython(
  value: unknown,
): ExecutePythonInput | undefined {
  const parsed = executePythonSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function formatSandboxExecResult(result: {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}): { isError: boolean; text: string } {
  const lines = [
    result.timedOut
      ? `timed out (exit ${result.exitCode})`
      : `exit ${result.exitCode}`,
  ];
  if (result.stdout) {
    lines.push(result.stdout);
  }
  if (result.stderr) {
    lines.push(result.stderr);
  }
  if (result.truncated) {
    lines.push("[output truncated]");
  }
  const text = lines.join("\n");
  if (result.timedOut || result.exitCode !== 0) {
    return { isError: true as const, text };
  }
  return { isError: false as const, text };
}

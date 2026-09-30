import type { FudaClient } from "@keidai/shared/clients";
import { createSandboxTokenProvider } from "../fuda/sandbox-token-provider.js";

export interface SandboxExecRequest {
  source: string;
  timeoutSeconds?: number;
}

export interface SandboxExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

export interface SandboxClient {
  exec(runId: string, request: SandboxExecRequest): Promise<SandboxExecResult>;
  deleteRun(runId: string): Promise<void>;
  listRuns(): Promise<string[]>;
}

/** Sandbox client that presents a Fuda `aud=shaiden-sandbox` JWT on every call. */
export function createRuntimeSandboxClient(input: {
  baseUrl: string;
  fuda: FudaClient;
  getSubjectToken: () => string | Promise<string>;
}): SandboxClient {
  const tokens = createSandboxTokenProvider({
    fuda: input.fuda,
    getSubjectToken: input.getSubjectToken,
  });
  return createSandboxClient(input.baseUrl, {
    getAccessToken: () => tokens.ensureToken(),
  });
}

export function createSandboxClient(
  baseUrl: string,
  options?: { getAccessToken?: () => Promise<string> },
): SandboxClient {
  const root = baseUrl.replace(/\/$/, "");

  async function headers(extra?: Record<string, string>): Promise<Record<string, string>> {
    const token = await options?.getAccessToken?.();
    return {
      ...(extra ?? {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  }

  return {
    async exec(runId, request) {
      const response = await fetch(`${root}/runs/${encodeURIComponent(runId)}/exec`, {
        method: "POST",
        headers: await headers({ "content-type": "application/json" }),
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `sandbox exec failed: ${response.status}${detail ? ` ${detail}` : ""}`,
        );
      }
      return (await response.json()) as SandboxExecResult;
    },

    async deleteRun(runId) {
      const response = await fetch(`${root}/runs/${encodeURIComponent(runId)}`, {
        method: "DELETE",
        headers: await headers(),
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`sandbox delete failed: ${response.status}`);
      }
    },

    async listRuns() {
      const response = await fetch(`${root}/runs`, { headers: await headers() });
      if (!response.ok) {
        throw new Error(`sandbox list failed: ${response.status}`);
      }
      const body = (await response.json()) as { runIds?: unknown };
      if (!Array.isArray(body.runIds)) {
        throw new Error("sandbox list returned no runIds");
      }
      return body.runIds.filter((id): id is string => typeof id === "string");
    },
  };
}

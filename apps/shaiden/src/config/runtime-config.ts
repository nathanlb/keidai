import { readFileSync } from "node:fs";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const DEFAULT_MODEL_ID = "google/gemini-2.5-flash";
const DEFAULT_HTTP_PORT = 3200;

export interface RuntimeConfig {
  toriiMcpUrl: string;
  /**
   * Subject token for Fuda token exchange. Re-read on every mint when backed
   * by `SHAIDEN_SUBJECT_TOKEN_FILE` (projected SA tokens rotate). When
   * `fudaBaseUrl` is unset (eval/tests), the value is presented to Torii
   * directly.
   */
  getSubjectToken: () => string;
  /**
   * Fuda base URL for `POST /token`. Required via `loadRuntimeConfig` /
   * `FUDA_URL`; optional on the type so evals can omit minting.
   */
  fudaBaseUrl?: string;
  openRouterApiKey: string;
  modelId: string;
  httpHost: string;
  httpPort: number;
}

/**
 * Exactly one of `SHAIDEN_BEARER` or `SHAIDEN_SUBJECT_TOKEN_FILE` must be set.
 * File mode re-reads the path on each call so projected SA tokens stay fresh.
 */
export function resolveSubjectTokenReader(
  env: NodeJS.ProcessEnv = process.env,
): () => string {
  const bearer = env.SHAIDEN_BEARER?.trim() ?? "";
  const tokenFile = env.SHAIDEN_SUBJECT_TOKEN_FILE?.trim() ?? "";

  if (bearer && tokenFile) {
    throw new Error(
      "Set exactly one of SHAIDEN_BEARER or SHAIDEN_SUBJECT_TOKEN_FILE, not both",
    );
  }
  if (!bearer && !tokenFile) {
    throw new Error(
      "Missing subject token: set SHAIDEN_BEARER or SHAIDEN_SUBJECT_TOKEN_FILE",
    );
  }

  if (tokenFile) {
    return () => {
      const value = readFileSync(tokenFile, "utf8").trim();
      if (!value) {
        throw new Error(
          `Subject token file is empty: ${tokenFile}`,
        );
      }
      return value;
    };
  }

  return () => bearer;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const rawPort = process.env.SHAIDEN_PORT?.trim() ?? String(DEFAULT_HTTP_PORT);
  const httpPort = Number(rawPort);
  if (!Number.isFinite(httpPort) || httpPort <= 0) {
    throw new Error(`Invalid SHAIDEN_PORT: ${rawPort}`);
  }

  return {
    toriiMcpUrl:
      process.env.TORII_MCP_URL?.trim() ?? "http://127.0.0.1:3100/mcp",
    getSubjectToken: resolveSubjectTokenReader(),
    fudaBaseUrl: requiredEnv("FUDA_URL"),
    openRouterApiKey: requiredEnv("OPEN_ROUTER_API_KEY"),
    modelId: process.env.SHAIDEN_MODEL_ID?.trim() ?? DEFAULT_MODEL_ID,
    httpHost: process.env.SHAIDEN_HOST?.trim() ?? "127.0.0.1",
    httpPort,
  };
}

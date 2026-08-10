import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import {
  OperatorsValidationError,
  parseOperatorsDocument,
  type OperatorEntry,
  type OperatorsFile,
} from "@keidai/shared";
import type { OperatorAuthConfig } from "./types.js";

export class OperatorAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatorAuthConfigError";
  }
}

function requireEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new OperatorAuthConfigError(`Missing required environment variable: ${name}`);
  }
  return trimmed;
}

export async function loadOperatorsFile(filePath: string): Promise<OperatorsFile> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new OperatorAuthConfigError(
      `Failed to read operators file at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  let document: unknown;
  try {
    document = parseYaml(raw);
  } catch (error) {
    throw new OperatorAuthConfigError(
      `Failed to parse operators YAML at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  try {
    return parseOperatorsDocument(document);
  } catch (error) {
    if (error instanceof OperatorsValidationError) {
      throw new OperatorAuthConfigError(
        `Invalid operators file ${filePath}: ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Resolves operator Google OIDC config from process env + operators.yaml.
 *
 * Required:
 * - KEIDAI_GOOGLE_CLIENT_ID
 * - KEIDAI_GOOGLE_CLIENT_SECRET
 * - KEIDAI_GOOGLE_REDIRECT_URI
 * - KEIDAI_SESSION_SECRET (≥32 characters)
 * - KEIDAI_OPERATORS_PATH (operators.yaml SSOT)
 */
export async function resolveOperatorAuthConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<OperatorAuthConfig> {
  const googleClientId = requireEnv(
    "KEIDAI_GOOGLE_CLIENT_ID",
    env.KEIDAI_GOOGLE_CLIENT_ID,
  );
  const googleClientSecret = requireEnv(
    "KEIDAI_GOOGLE_CLIENT_SECRET",
    env.KEIDAI_GOOGLE_CLIENT_SECRET,
  );
  const redirectUri = requireEnv(
    "KEIDAI_GOOGLE_REDIRECT_URI",
    env.KEIDAI_GOOGLE_REDIRECT_URI,
  );
  const sessionSecret = requireEnv(
    "KEIDAI_SESSION_SECRET",
    env.KEIDAI_SESSION_SECRET,
  );
  if (sessionSecret.length < 32) {
    throw new OperatorAuthConfigError(
      "KEIDAI_SESSION_SECRET must be at least 32 characters",
    );
  }

  const operatorsPath = requireEnv(
    "KEIDAI_OPERATORS_PATH",
    env.KEIDAI_OPERATORS_PATH,
  );
  const operatorsFile = await loadOperatorsFile(operatorsPath);
  const operators: readonly OperatorEntry[] = operatorsFile.operators;

  const cookieSecure =
    env.KEIDAI_COOKIE_SECURE === "true" ||
    (env.KEIDAI_COOKIE_SECURE !== "false" && env.NODE_ENV === "production");

  return {
    googleClientId,
    googleClientSecret,
    redirectUri,
    sessionSecret,
    operators,
    cookieSecure,
  };
}

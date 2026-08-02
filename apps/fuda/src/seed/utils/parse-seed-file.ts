import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { ConfigValidationError } from "../../config/runtime-config.js";
import { seedFileSchema, type SeedFile } from "../types/seed-file.js";
import {
  formatMissingEnvVars,
  resolveEnvRefs,
} from "./resolve-env-refs.js";

/** Torii registration fields that Fuda does not persist. */
const IGNORED_AGENT_KEYS = new Set([
  "subject",
  "inbound_token",
  "gated_tools",
]);

function stripIgnoredAgentFields(document: unknown): unknown {
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    return document;
  }

  const root = { ...(document as Record<string, unknown>) };
  if (!Array.isArray(root.agents)) {
    return root;
  }

  root.agents = root.agents.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return entry;
    }
    return Object.fromEntries(
      Object.entries(entry as Record<string, unknown>).filter(
        ([key]) => !IGNORED_AGENT_KEYS.has(key),
      ),
    );
  });
  return root;
}

export function parseSeedDocument(
  document: unknown,
  env: NodeJS.ProcessEnv = process.env,
): SeedFile {
  const stripped = stripIgnoredAgentFields(document);
  const { resolved, missing } = resolveEnvRefs(stripped, env);
  const errors: string[] = [];

  if (missing.length > 0) {
    errors.push(...formatMissingEnvVars(missing));
  }

  const parsed = seedFileSchema.safeParse(resolved);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "seed";
      errors.push(`${path}: ${issue.message}`);
    }
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  return parsed.data!;
}

export async function loadSeedFile(
  filePath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SeedFile> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new ConfigValidationError([
      `Unable to read seed file ${filePath}: ${message}`,
    ]);
  }

  let document: unknown;
  try {
    document = parseYaml(raw);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new ConfigValidationError([
      `Invalid YAML in seed file ${filePath}: ${message}`,
    ]);
  }

  return parseSeedDocument(document, env);
}

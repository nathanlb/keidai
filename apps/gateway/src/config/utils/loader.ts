import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import type { ToriiConfig } from "@torii/shared";
import {
  formatMissingEnvVars,
  resolveEnvRefs,
} from "./env-resolver.js";
import {
  formatSchemaIssues,
  toriiConfigSchema,
} from "./schema.js";

export class ConfigValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join("\n"));
    this.name = "ConfigValidationError";
  }
}

export function loadConfigFromDocument(
  document: unknown,
  env: NodeJS.ProcessEnv = process.env,
): ToriiConfig {
  const { resolved, missing } = resolveEnvRefs(document, env);
  const errors: string[] = [];

  if (missing.length > 0) {
    errors.push(...formatMissingEnvVars(missing));
  }

  const result = toriiConfigSchema.safeParse(resolved);
  if (!result.success) {
    errors.push(...formatSchemaIssues(result.error));
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  return result.data!;
}

export async function loadConfig(): Promise<ToriiConfig> {
  const configPath = process.env.TORII_CONFIG_PATH ?? "./torii.yaml";
  const raw = await readFile(configPath, "utf8");
  const document = parse(raw);

  return loadConfigFromDocument(document);
}

export function reportConfigError(error: unknown): never {
  if (error instanceof ConfigValidationError) {
    for (const message of error.errors) {
      console.error(message);
    }
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }

  process.exit(1);
}

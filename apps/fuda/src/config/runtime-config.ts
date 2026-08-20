import { z } from "zod";
import {
  ALL_ROUTE_GROUPS,
  isRouteGroup,
  type RouteGroup,
} from "../http/types/route-group.js";
import type { SigningKeysConfig } from "../signing/types/signing-key-config.js";
import { parseSigningKeysEnv } from "../signing/utils/parse-signing-keys-env.js";
import type {
  SubjectTokenValidatorConfig,
  SubjectTokenValidatorSelection,
} from "../subject-token/types/subject-token-validator-config.js";
import { tryResolveSubjectTokenValidatorConfig } from "../subject-token/utils/resolve-subject-token-validator-config.js";
import { resolveFudaDatabaseUrl } from "../storage/fuda-postgres.js";
import { SchemaIntegrityError } from "../storage/validate-schema-integrity.js";

const DEFAULT_HTTP_PORT = 3300;

export class ConfigValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join("\n"));
    this.name = "ConfigValidationError";
  }
}

export interface RuntimeConfig {
  httpHost: string;
  httpPort: number;
  databaseUrl: string;
  listenGroups: readonly RouteGroup[];
  signingKeys: SigningKeysConfig;
  /** Issuer claim (`iss`) on minted agent identity tokens. */
  tokenIssuer: string;
  /**
   * Selected subject-token validator kind. Required when the `agent` route
   * group is enabled (token exchange). Null for public/management-only
   * processes. Validator-private credential material is not retained here —
   * only the one-shot subjectTokenValidatorConfig from loadRuntimeConfig
   * (consumed at container build) and the DI validator hold it.
   */
  subjectTokenValidator: SubjectTokenValidatorSelection | null;
}

/**
 * Boot load result: public {@link RuntimeConfig} plus one-shot validator
 * wiring consumed by createContainer.
 */
export interface LoadedRuntimeConfig {
  config: RuntimeConfig;
  /** Consumed once to construct the DI validator; not retained on config. */
  subjectTokenValidatorConfig: SubjectTokenValidatorConfig | null;
}

const runtimeConfigSchema = z.object({
  httpHost: z.string().min(1),
  httpPort: z.number().int().positive(),
  databaseUrl: z.string().min(1),
  listenGroups: z.array(z.enum(["public", "agent", "management"])).nonempty(),
  signingKeys: z.object({
    keys: z
      .array(
        z.object({
          kid: z.string().min(1),
          material: z.union([
            z.object({ kind: z.literal("file"), path: z.string().min(1) }),
            z.object({ kind: z.literal("env"), name: z.string().min(1) }),
          ]),
        }),
      )
      .nonempty(),
    signingKid: z.string().min(1),
  }),
  tokenIssuer: z.string().url(),
});

function parseListenGroups(raw: string | undefined): RouteGroup[] | string {
  if (raw === undefined || raw.trim() === "") {
    return [...ALL_ROUTE_GROUPS];
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "FUDA_LISTEN_GROUPS must list at least one route group";
  }

  const groups: RouteGroup[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (!isRouteGroup(part)) {
      return `Invalid FUDA_LISTEN_GROUPS entry: ${part} (expected public, agent, or management)`;
    }
    if (seen.has(part)) {
      continue;
    }
    seen.add(part);
    groups.push(part);
  }

  return groups;
}

function loadHttpConfig(
  env: NodeJS.ProcessEnv,
  errors: string[],
): { httpHost: string; httpPort: number } {
  const httpHost = env.FUDA_HOST?.trim() || "127.0.0.1";
  const rawPort = env.FUDA_PORT?.trim() ?? String(DEFAULT_HTTP_PORT);
  const httpPort = Number(rawPort);
  if (!Number.isFinite(httpPort) || httpPort <= 0 || !Number.isInteger(httpPort)) {
    errors.push(`Invalid FUDA_PORT: ${rawPort}`);
  }
  return { httpHost, httpPort };
}

function loadListenGroupsConfig(
  env: NodeJS.ProcessEnv,
  errors: string[],
): RouteGroup[] | null {
  const listenGroupsOrError = parseListenGroups(env.FUDA_LISTEN_GROUPS);
  if (typeof listenGroupsOrError === "string") {
    errors.push(listenGroupsOrError);
    return null;
  }
  return listenGroupsOrError;
}

function loadSigningKeysConfig(
  env: NodeJS.ProcessEnv,
  errors: string[],
): SigningKeysConfig | null {
  const signingKeysOrError = parseSigningKeysEnv(
    env.FUDA_SIGNING_KEYS,
    env.FUDA_SIGNING_KID,
  );
  if (typeof signingKeysOrError === "string") {
    errors.push(signingKeysOrError);
    return null;
  }
  return signingKeysOrError;
}

function loadTokenIssuerConfig(
  env: NodeJS.ProcessEnv,
  errors: string[],
): string | null {
  const raw = env.FUDA_ISSUER?.trim();
  if (!raw) {
    errors.push("FUDA_ISSUER is required (issuer URL for minted agent tokens)");
    return null;
  }
  try {
    // Reject relative / non-absolute values early (zod .url() also checks later).
    new URL(raw);
  } catch {
    errors.push(`Invalid FUDA_ISSUER: ${raw}`);
    return null;
  }
  return raw;
}

function loadSubjectTokenValidatorConfig(
  env: NodeJS.ProcessEnv,
  errors: string[],
): { config: SubjectTokenValidatorConfig | null; failed: boolean } {
  try {
    return {
      config: tryResolveSubjectTokenValidatorConfig(env),
      failed: false,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { config: null, failed: true };
  }
}

function validateSubjectTokenForRouteGroups(
  listenGroups: RouteGroup[] | null,
  subjectTokenValidator: SubjectTokenValidatorConfig | null,
  subjectTokenLoadFailed: boolean,
  errors: string[],
): void {
  // Report independently of other boot errors, but not when subject-token
  // env was present and already failed (malformed / ambiguous / partial).
  if (
    listenGroups?.includes("agent") &&
    subjectTokenValidator === null &&
    !subjectTokenLoadFailed
  ) {
    errors.push(
      "Subject token validator required when FUDA_LISTEN_GROUPS includes agent; set FUDA_STATIC_SUBJECT_TOKEN (or FUDA_K8S_SA_OIDC_* together)",
    );
  }
}

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): LoadedRuntimeConfig {
  const errors: string[] = [];

  const { httpHost, httpPort } = loadHttpConfig(env, errors);
  const listenGroups = loadListenGroupsConfig(env, errors);
  const signingKeys = loadSigningKeysConfig(env, errors);
  const tokenIssuer = loadTokenIssuerConfig(env, errors);
  const {
    config: subjectTokenValidatorConfig,
    failed: subjectTokenLoadFailed,
  } = loadSubjectTokenValidatorConfig(env, errors);
  validateSubjectTokenForRouteGroups(
    listenGroups,
    subjectTokenValidatorConfig,
    subjectTokenLoadFailed,
    errors,
  );

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  const parsed = runtimeConfigSchema.safeParse({
    httpHost,
    httpPort,
    databaseUrl: resolveFudaDatabaseUrl(env),
    listenGroups: listenGroups!,
    signingKeys: signingKeys!,
    tokenIssuer: tokenIssuer!,
  });
  if (!parsed.success) {
    throw new ConfigValidationError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "config"}: ${issue.message}`,
      ),
    );
  }

  return {
    config: {
      ...parsed.data,
      subjectTokenValidator: subjectTokenValidatorConfig
        ? { kind: subjectTokenValidatorConfig.kind }
        : null,
    },
    subjectTokenValidatorConfig,
  };
}

export function reportConfigError(error: unknown): never {
  if (
    error instanceof ConfigValidationError ||
    error instanceof SchemaIntegrityError
  ) {
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

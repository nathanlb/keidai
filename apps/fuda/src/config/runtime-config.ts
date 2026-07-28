import { z } from "zod";
import {
  ALL_ROUTE_GROUPS,
  isRouteGroup,
  type RouteGroup,
} from "../http/types/route-group.js";
import { resolveFudaDbPath } from "../storage/fuda-db-path.js";

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
  dbPath: string;
  listenGroups: readonly RouteGroup[];
}

const runtimeConfigSchema = z.object({
  httpHost: z.string().min(1),
  httpPort: z.number().int().positive(),
  dbPath: z.string().min(1),
  listenGroups: z.array(z.enum(["public", "agent", "management"])).nonempty(),
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

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const errors: string[] = [];

  const rawPort = env.FUDA_PORT?.trim() ?? String(DEFAULT_HTTP_PORT);
  const httpPort = Number(rawPort);
  if (!Number.isFinite(httpPort) || httpPort <= 0 || !Number.isInteger(httpPort)) {
    errors.push(`Invalid FUDA_PORT: ${rawPort}`);
  }

  const listenGroupsOrError = parseListenGroups(env.FUDA_LISTEN_GROUPS);
  if (typeof listenGroupsOrError === "string") {
    errors.push(listenGroupsOrError);
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  const candidate = {
    httpHost: env.FUDA_HOST?.trim() || "127.0.0.1",
    httpPort,
    dbPath: resolveFudaDbPath(env),
    listenGroups: listenGroupsOrError as RouteGroup[],
  };

  const parsed = runtimeConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ConfigValidationError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "config"}: ${issue.message}`,
      ),
    );
  }

  return parsed.data;
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

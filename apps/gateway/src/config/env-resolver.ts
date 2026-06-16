const ENV_REF_PATTERN = /\$\{env:([^}]+)\}/g;

export function collectEnvRefs(value: string): string[] {
  const refs: string[] = [];
  for (const match of value.matchAll(ENV_REF_PATTERN)) {
    const name = match[1];
    if (name !== undefined) {
      refs.push(name);
    }
  }
  return refs;
}

export function resolveEnvRefs(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): { resolved: unknown; missing: string[] } {
  const missing = new Set<string>();

  const resolve = (current: unknown): unknown => {
    if (typeof current === "string") {
      return current.replace(ENV_REF_PATTERN, (_match, name: string) => {
        const envValue = env[name];
        if (envValue === undefined) {
          missing.add(name);
          return _match;
        }
        return envValue;
      });
    }

    if (Array.isArray(current)) {
      return current.map(resolve);
    }

    if (current !== null && typeof current === "object") {
      return Object.fromEntries(
        Object.entries(current).map(([key, entry]) => [key, resolve(entry)]),
      );
    }

    return current;
  };

  return { resolved: resolve(value), missing: [...missing] };
}

export function formatMissingEnvVars(missing: string[]): string[] {
  return [...new Set(missing)]
    .sort()
    .map((name) => `Missing environment variable: ${name}`);
}

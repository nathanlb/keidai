import type { OpenRouterModelOption } from "./types.js";

interface OpenRouterModelRecord {
  id?: unknown;
  name?: unknown;
  supported_parameters?: unknown;
}

function isToolUseModel(record: OpenRouterModelRecord): boolean {
  const parameters = record.supported_parameters;
  return (
    Array.isArray(parameters) &&
    parameters.some((parameter) => parameter === "tools")
  );
}

/** Keep models OpenRouter reports as accepting tool calls. */
export function selectToolUseModels(payload: unknown): OpenRouterModelOption[] {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }

  const models: OpenRouterModelOption[] = [];
  const seen = new Set<string>();
  for (const entry of data) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as OpenRouterModelRecord;
    if (typeof record.id !== "string" || typeof record.name !== "string") {
      continue;
    }
    if (!isToolUseModel(record) || seen.has(record.id)) {
      continue;
    }
    seen.add(record.id);
    models.push({ id: record.id, name: record.name });
  }

  models.sort((left, right) => left.name.localeCompare(right.name));
  return models;
}

import { fetchJson, fetchJsonWithBody } from "./fetch-json.js";

export interface OpenRouterCredentialStatus {
  configured: boolean;
  hint: string | null;
  source: "stored" | "environment" | "none";
}

export interface OpenRouterModelOption {
  id: string;
  name: string;
}

export async function fetchOpenRouterCredential(): Promise<OpenRouterCredentialStatus> {
  return fetchJson("/api/openrouter/credential");
}

export async function saveOpenRouterCredential(
  apiKey: string,
): Promise<OpenRouterCredentialStatus> {
  return fetchJsonWithBody("/api/openrouter/credential", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
}

export async function clearOpenRouterCredential(): Promise<OpenRouterCredentialStatus> {
  return fetchJsonWithBody("/api/openrouter/credential", { method: "DELETE" });
}

export async function fetchOpenRouterModels(): Promise<{
  models: OpenRouterModelOption[];
}> {
  return fetchJson("/api/openrouter/models");
}

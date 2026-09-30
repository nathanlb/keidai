import { Button, Input, Spinner } from "@keidai/ui";
import { useState } from "react";
import useSWR from "swr";
import {
  clearOpenRouterCredential,
  fetchOpenRouterCredential,
  saveOpenRouterCredential,
  type OpenRouterCredentialStatus,
} from "../lib/api/openrouter.js";

const CREDENTIAL_KEY = "openrouter-credential";

function statusCopy(status: OpenRouterCredentialStatus | undefined): string {
  if (!status || status.source === "none") {
    return "No OpenRouter API key is configured. Runs cannot call a model until you save one.";
  }
  if (status.source === "stored") {
    return `Runs use the key saved here (${status.hint ?? "stored"}). Removing it falls back to the server environment, if one is set.`;
  }
  return `Runs use the key from the server environment (${status.hint ?? "set"}). Saving a key here replaces it until you remove the saved key.`;
}

export function SettingsView() {
  const { data, error, isLoading, mutate } = useSWR(
    CREDENTIAL_KEY,
    fetchOpenRouterCredential,
    { onError: () => undefined },
  );
  const [apiKey, setApiKey] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  async function handleSave() {
    const trimmed = apiKey.trim();
    if (trimmed.length < 20) {
      setSubmitError("Enter the full OpenRouter API key.");
      return;
    }
    setIsSaving(true);
    setSubmitError(null);
    try {
      await saveOpenRouterCredential(trimmed);
      setApiKey("");
      await mutate();
    } catch (cause) {
      setSubmitError(
        cause instanceof Error ? cause.message : "Failed to save the API key",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear() {
    setIsClearing(true);
    setSubmitError(null);
    try {
      await clearOpenRouterCredential();
      await mutate();
    } catch (cause) {
      setSubmitError(
        cause instanceof Error ? cause.message : "Failed to remove the API key",
      );
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <div className="flex max-w-170 flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-[15px] font-semibold">OpenRouter API key</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {isLoading ? "Checking the saved key…" : statusCopy(data)}
        </p>
        {error ? (
          <p className="mt-2 text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Failed to load the key status"}
          </p>
        ) : null}
        <label
          className="mt-4 mb-1.5 block text-[13px] font-medium"
          htmlFor="openrouter-api-key"
        >
          {data?.source === "stored" ? "Replace key" : "API key"}
        </label>
        <Input
          id="openrouter-api-key"
          type="password"
          autoComplete="new-password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="sk-or-v1-…"
          className="h-9.5 font-mono"
        />
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">
          Stored encrypted. The UI only keeps a hint of the last four
          characters.
        </p>
        {submitError ? (
          <p className="mt-2 text-sm text-destructive">{submitError}</p>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          {data?.source === "stored" ? (
            <Button
              type="button"
              variant="ghost"
              disabled={isClearing || isSaving}
              onClick={() => void handleClear()}
            >
              {isClearing ? <Spinner className="size-3.5" aria-hidden /> : null}
              Remove saved key
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={isSaving || isClearing || apiKey.trim().length === 0}
            onClick={() => void handleSave()}
          >
            {isSaving ? <Spinner className="size-3.5" aria-hidden /> : null}
            Save key
          </Button>
        </div>
      </div>
    </div>
  );
}

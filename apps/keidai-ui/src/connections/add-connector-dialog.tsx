import type { CatalogEntry, ConnectorAuthMode } from "@keidai/shared";
import { CONNECTOR_SLUG_PATTERN } from "@keidai/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@keidai/ui";
import { Loader2, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import {
  createConnector,
  getOperatorEdgeOrigin,
  installCatalogConnector,
} from "../lib/api/gateway.js";
import { ConnectorIcon } from "../lib/components/connector-icon.js";
import { useFetchConnectorCatalog } from "../lib/hooks/use-fetch-connector-catalog.js";
import { CONNECTORS_KEY } from "../lib/hooks/use-fetch-connectors.js";
import { OAUTH_PROVIDERS_KEY } from "../lib/hooks/use-fetch-oauth-providers.js";
import { SERVERS_KEY } from "../lib/hooks/use-fetch-servers.js";
import { buildToriiOAuthCallbackUrl } from "../oauth/utils/build-torii-oauth-callback-url.js";

function setupCopy(entry: CatalogEntry, slug: string): string {
  if (entry.setup.kind === "discovered") {
    return "Install, then link your account. Torii discovers the authorization server and registers itself.";
  }
  if (entry.setup.kind === "api_key") {
    return `Paste an API key. Docs: ${entry.setup.docsUrl}`;
  }
  const callback = buildToriiOAuthCallbackUrl(slug);
  const origin = getOperatorEdgeOrigin();
  return entry.setup.instructions
    .replaceAll("{callback}", callback)
    .replaceAll("{origin}", origin);
}

export function AddConnectorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: catalogData, isLoading: catalogLoading } =
    useFetchConnectorCatalog();
  const { mutate } = useSWRConfig();
  const [mode, setMode] = useState<"catalog" | "custom">("catalog");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customAuth, setCustomAuth] = useState<ConnectorAuthMode>("none");

  const catalog = catalogData?.catalog ?? [];
  const selected = useMemo(
    () => catalog.find((entry) => entry.id === selectedId) ?? null,
    [catalog, selectedId],
  );

  function resetForm() {
    setSelectedId(null);
    setError(null);
    setIsSubmitting(false);
    setClientId("");
    setClientSecret("");
    setServiceKey("");
    setCustomSlug("");
    setCustomName("");
    setCustomUrl("");
    setCustomAuth("none");
    setMode("catalog");
  }

  async function refreshCaches() {
    await mutate(CONNECTORS_KEY);
    await mutate(SERVERS_KEY);
    await mutate(OAUTH_PROVIDERS_KEY);
  }

  async function handleCatalogInstall(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      return;
    }
    if (selected.setup.kind === "byo_oauth" && (!clientId || !clientSecret)) {
      setError("Client ID and secret are required for this connector.");
      return;
    }
    if (selected.setup.kind === "api_key" && !serviceKey) {
      setError("An API key is required for this connector.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await installCatalogConnector({
        catalogId: selected.id,
        ...(selected.setup.kind === "byo_oauth"
          ? { oauthClient: { clientId, clientSecret } }
          : {}),
        ...(selected.setup.kind === "api_key" ? { serviceKey } : {}),
      });
      await refreshCaches();
      resetForm();
      onOpenChange(false);
    } catch (installError) {
      setError(
        installError instanceof Error
          ? installError.message
          : "Could not install connector.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCustomCreate(event: FormEvent) {
    event.preventDefault();
    if (!CONNECTOR_SLUG_PATTERN.test(customSlug)) {
      setError(
        "Slug must be lowercase, start with a letter, and use only letters, digits, _ or -.",
      );
      return;
    }
    if (customAuth === "service_key" && !serviceKey) {
      setError("An API key is required for service_key connectors.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await createConnector({
        slug: customSlug,
        displayName: customName.trim() || customSlug,
        url: customUrl,
        authMode: customAuth,
        ...(customAuth === "service_key" ? { serviceKey } : {}),
        ...(customAuth === "user_oauth" && clientId && clientSecret
          ? { oauth: { clientId, clientSecret } }
          : {}),
      });
      await refreshCaches();
      resetForm();
      onOpenChange(false);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create connector.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          resetForm();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Add connector</DialogTitle>
          <DialogDescription>
            Install a prebuilt MCP server or define a custom backend.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3 flex gap-1 rounded-lg bg-secondary p-1">
          <Button
            type="button"
            size="sm"
            variant={mode === "catalog" ? "default" : "ghost"}
            className="flex-1"
            onClick={() => {
              setMode("catalog");
              setError(null);
            }}
          >
            Catalog
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "custom" ? "default" : "ghost"}
            className="flex-1"
            onClick={() => {
              setMode("custom");
              setSelectedId(null);
              setError(null);
            }}
          >
            Custom
          </Button>
        </div>

        {mode === "catalog" ? (
          <form onSubmit={(event) => void handleCatalogInstall(event)}>
            {catalogLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Loading catalog…
              </p>
            ) : (
              <div className="mt-4 grid max-h-72 gap-2 overflow-y-auto pr-1">
                {catalog.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(entry.id);
                      setError(null);
                    }}
                    className={`
                      flex items-start gap-3 rounded-lg border px-3 py-2.5
                      text-left
                      ${
                        selectedId === entry.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-secondary/60"
                      }
                    `}
                  >
                    <ConnectorIcon
                      slug={entry.icon}
                      label={entry.displayName}
                      size="lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium">
                        {entry.displayName}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                        {entry.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selected ? (
              <div className="mt-4 space-y-3">
                <p className="text-[12.5px] leading-snug text-muted-foreground">
                  {setupCopy(selected, selected.id)}
                </p>
                {selected.setup.kind === "byo_oauth" ? (
                  <>
                    <div>
                      <label
                        className="text-[12.5px] font-medium"
                        htmlFor="oauth-client-id"
                      >
                        Client ID
                      </label>
                      <Input
                        id="oauth-client-id"
                        value={clientId}
                        onChange={(event) => setClientId(event.target.value)}
                        className="mt-1.5 h-9 font-mono"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label
                        className="text-[12.5px] font-medium"
                        htmlFor="oauth-client-secret"
                      >
                        Client secret
                      </label>
                      <Input
                        id="oauth-client-secret"
                        type="password"
                        value={clientSecret}
                        onChange={(event) =>
                          setClientSecret(event.target.value)
                        }
                        className="mt-1.5 h-9 font-mono"
                        autoComplete="off"
                      />
                    </div>
                  </>
                ) : null}
                {selected.setup.kind === "api_key" ? (
                  <div>
                    <label
                      className="text-[12.5px] font-medium"
                      htmlFor="catalog-api-key"
                    >
                      API key
                    </label>
                    <Input
                      id="catalog-api-key"
                      type="password"
                      value={serviceKey}
                      onChange={(event) => setServiceKey(event.target.value)}
                      className="mt-1.5 h-9 font-mono"
                      autoComplete="off"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p className="mt-3 text-[12.5px] text-destructive">{error}</p>
            ) : null}

            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!selected || isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Plus className="size-4" aria-hidden />
                )}
                Install
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form
            onSubmit={(event) => void handleCustomCreate(event)}
            className="mt-4 space-y-3"
          >
            <div>
              <label
                className="text-[12.5px] font-medium"
                htmlFor="custom-slug"
              >
                Slug
              </label>
              <Input
                id="custom-slug"
                value={customSlug}
                onChange={(event) => setCustomSlug(event.target.value)}
                placeholder="notion"
                className="mt-1.5 h-9 font-mono"
                autoComplete="off"
              />
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                Immutable. Used in tool names and group policy.
              </p>
            </div>
            <div>
              <label
                className="text-[12.5px] font-medium"
                htmlFor="custom-name"
              >
                Display name
              </label>
              <Input
                id="custom-name"
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="Notion"
                className="mt-1.5 h-9"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-[12.5px] font-medium" htmlFor="custom-url">
                MCP URL
              </label>
              <Input
                id="custom-url"
                value={customUrl}
                onChange={(event) => setCustomUrl(event.target.value)}
                placeholder="https://mcp.example.com/mcp"
                className="mt-1.5 h-9 font-mono"
                autoComplete="off"
              />
            </div>
            <div>
              <label
                className="text-[12.5px] font-medium"
                htmlFor="custom-auth"
              >
                Auth mode
              </label>
              <Select
                value={customAuth}
                onValueChange={(value) =>
                  setCustomAuth(value as ConnectorAuthMode)
                }
              >
                <SelectTrigger id="custom-auth" className="mt-1.5 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="user_oauth">User OAuth</SelectItem>
                  <SelectItem value="service_key">API key</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {customAuth === "service_key" ? (
              <div>
                <label
                  className="text-[12.5px] font-medium"
                  htmlFor="custom-key"
                >
                  API key
                </label>
                <Input
                  id="custom-key"
                  type="password"
                  value={serviceKey}
                  onChange={(event) => setServiceKey(event.target.value)}
                  className="mt-1.5 h-9 font-mono"
                  autoComplete="off"
                />
              </div>
            ) : null}
            {customAuth === "user_oauth" ? (
              <>
                <div>
                  <label
                    className="text-[12.5px] font-medium"
                    htmlFor="custom-client-id"
                  >
                    Client ID (optional)
                  </label>
                  <Input
                    id="custom-client-id"
                    value={clientId}
                    onChange={(event) => setClientId(event.target.value)}
                    className="mt-1.5 h-9 font-mono"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label
                    className="text-[12.5px] font-medium"
                    htmlFor="custom-client-secret"
                  >
                    Client secret (optional)
                  </label>
                  <Input
                    id="custom-client-secret"
                    type="password"
                    value={clientSecret}
                    onChange={(event) => setClientSecret(event.target.value)}
                    className="mt-1.5 h-9 font-mono"
                    autoComplete="off"
                  />
                </div>
              </>
            ) : null}

            {error ? (
              <p className="text-[12.5px] text-destructive">{error}</p>
            ) : null}

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!customSlug || !customUrl || isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Plus className="size-4" aria-hidden />
                )}
                Add connector
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

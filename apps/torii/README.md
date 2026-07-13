# ⛩️ Torii — MCP Gateway

Torii is the MCP gateway component of [Keidai](https://app.notion.com/p/Keidai-Agent-Platform-38307ec181ff815b8276d59d005fd612) — the agent platform monorepo. One endpoint for agents, fan-out to many backends. v0 is a long-lived proxy process + a config file, with structured traces to stdout/OTel and structured operational logs to stderr.

**Keidai** (境内) is the umbrella; **Torii** (鳥居, the gate) is this service. Torii owns access control and credential lifecycle at the MCP boundary. Agent identity (Fuda/AIdP) and execution (Shaiden/Runtime) live elsewhere in Keidai.

Design docs: [Torii — MCP Gateway](https://app.notion.com/p/Torii-MCP-Gateway-36c07ec181ff813d8f34f9b0e617de34) · [Keidai — Agent Platform](https://app.notion.com/p/Keidai-Agent-Platform-38307ec181ff815b8276d59d005fd612)

## Stack

- **Runtime:** Node.js 24 (LTS)
- **Framework:** TypeScript, Fastify, tsyringe, official MCP SDK
- **Config:** `torii.yaml` at boot — no database
- **Shared types:** `@keidai/shared` (`packages/shared`)

## Layout

```
src/
  config/       # boot-time load, env resolution, ToriiConfigService
  backends/     # backend registry, MCP client connector
  catalog/      # fan-out tools/list, namespacing (server.tool)
  credentials/  # user_oauth / service_key / none credential resolvers
  dispatch/     # route tools/call to the correct backend
  policy/       # list-level and call-level policy enforcement
  trace/        # structured CallTrace emission
  logging/      # structured operational logs (stderr)
  identity/     # inbound agent identity (k8s SA OIDC in v0)
  mcp/          # inbound gateway MCP server (Fastify + SDK)
  container.ts  # tsyringe registrations
  index.ts      # process entry / boot sequence
```

## Getting started

From the monorepo root:

```bash
pnpm install
pnpm build
cp apps/torii/.env.example apps/torii/.env   # edit as needed
cp torii.example.yaml torii.yaml                 # or use torii.demo.yaml for the demo
pnpm --filter @keidai/torii dev
```

Environment variables load from the repo root `.env` (shared) then `apps/torii/.env` (overrides). See [`.env.example`](.env.example) and the repo root [`.env.example`](../../.env.example).

## Log streams

During normal gateway operation Torii uses two machine-readable streams:

| Stream | Content | Schema |
|--------|---------|--------|
| **stdout** | `CallTrace` audit records (`tools/call`) only | JSON with `recordType: "call_trace"` and `traceId` |
| **stderr** | Structured operational logs (boot, connections, catalog, policy, OAuth, HTTP access) | JSON with `recordType: "log"`, `level`, and `event` |

Human-readable config validation errors may still use prose on the terminal; they are not part of the operational log stream.

Or run the built CLI:

```bash
pnpm --filter @keidai/torii start
# equivalent: torii (bin name)
```

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `TORII_CONFIG_PATH` | `./torii.yaml` | Gateway config file |
| `TORII_PORT` | `3100` (falls back to `PORT`) | HTTP listen port |
| `TORII_HOST` | `127.0.0.1` | HTTP bind address |
| `TORII_UI_CLIENT_ROOT` | — | Path to built keidai-ui client (`dist/client`); when set, Torii serves the UI on the same origin as `/api` and `/mcp` |
| `TORII_DB_PATH` | `./data/torii.db` | SQLite path for gateway persistent storage (OAuth tokens, provider clients, call traces) |
| `TORII_GATEWAY_BASE_URL` | — | Stable public base URL for OAuth callbacks (overrides per-request Host derivation) |
| `TORII_K8S_SA_OIDC_ISSUER` | — | K8s SA OIDC issuer (optional; enables JWT identity when set with audience + JWKS) |
| `TORII_K8S_SA_OIDC_AUDIENCE` | — | Expected JWT audience |
| `TORII_K8S_SA_OIDC_JWKS_URI` | — | JWKS endpoint for token verification |

See `torii.example.yaml` at the repo root for server list, policy, OAuth providers, and agent registration shapes. Demo config: [`torii.demo.yaml`](torii.demo.yaml) in this package.

Optional `gateway_base_url` in torii.yaml (or `TORII_GATEWAY_BASE_URL`) sets the stable public URL used to derive OAuth callback URIs: `{base}/oauth/callback/{provider}`.

## Agent identity

Inbound requests are authenticated via a single resolver wired at boot:

- **`agents[].inbound_token`** — static bearer declared in config (env refs resolved at load). Demo agents use this.
- **K8s SA OIDC** — when `TORII_K8S_SA_OIDC_*` env vars are all set, projected service account JWTs are also accepted and mapped via `agents[].subject`.

Backend OAuth for `user_oauth` servers is separate: tokens are persisted in SQLite via the keidai-ui OAuth providers screen, keyed by `(owner_id, provider)` from the resolved agent principal.

## Trace feed API (UI)

The Activity & traces screen reads from HTTP endpoints backed by a SQLite buffer in the gateway database (`TORII_DB_PATH`). The API contract is store-agnostic so the backing implementation can move to an external observability backend later (OTel collector → time-series / log store) without UI changes.

Traces are retained in SQLite (most recent 200 by default). Payloads include credential **refs** only — never token values or other secrets.

## OAuth linking (UI)

Link an owner's OAuth token before `user_oauth` backends can resolve credentials:

1. Start the gateway and keidai-ui (`pnpm --filter @keidai/keidai-ui dev`)
2. Open the **OAuth providers** screen
3. Select the owner and click **Link account** for each provider

The gateway derives the callback URL as `{gateway_base}/oauth/callback/{provider}` (default local: `http://127.0.0.1:3100/oauth/callback/github`). For **static** providers (GitHub, Google), register that exact callback URL in the provider's developer console. **Dynamic** providers (Notion MCP) register automatically on first link.

The `owner_id` must match the registered agent's owner — tokens linked for a different owner will not resolve at call time.

### Resetting stale OAuth data

If dynamic clients were registered with an old redirect URI, clear SQLite and re-link:

```bash
sqlite3 ./data/torii.db \
  "DELETE FROM oauth_provider_clients; DELETE FROM oauth_tokens;"
```

## MCP Inspector (dev)

Browse Torii's tools, resources, and prompts in the browser during development.

**Prerequisite:** Torii must be running (e.g. `pnpm --filter @keidai/torii dev` or `pnpm demo:torii` from the repo root).

```bash
pnpm --filter @keidai/torii dev:inspect
```

This launches [@modelcontextprotocol/inspector](https://github.com/modelcontextprotocol/inspector) via a local auth shim that injects `Authorization: Bearer <DEMO_AGENT_BEARER>` on every request to Torii. Use the same bearer value as `agents[].inbound_token` in your `torii.yaml` (demo: `DEMO_AGENT_BEARER` in the repo root `.env`). Without it, Torii returns `401` and the Inspector incorrectly attempts MCP OAuth — you will see **OAuth Authentication Failed**.

The Inspector UI opens automatically at `http://localhost:6274` (or prints the URL with a session token). Torii's MCP endpoint defaults to `http://127.0.0.1:3100/mcp`; override with `TORII_HOST` / `TORII_PORT` if needed.

## Demo harness

See **[docs/demo.md](../../docs/demo.md)** for the full open-torii demo walkthrough.

```bash
pnpm demo:torii   # from repo root
pnpm demo
```

## Docker

Build from the monorepo root (serves keidai-ui and the gateway on one port):

```bash
docker build -f apps/torii/Dockerfile -t torii .
docker run --rm -p 3100:3100 \
  -e GITHUB_CLIENT_ID=... -e GITHUB_CLIENT_SECRET=... \
  -v torii-data:/app/data \
  torii
```

Open [http://localhost:3100](http://localhost:3100) for the UI. Mount a custom config with `-v ./torii.yaml:/app/torii.yaml:ro` and set `TORII_GATEWAY_BASE_URL` to your public URL for OAuth callbacks.

## License

Apache-2.0

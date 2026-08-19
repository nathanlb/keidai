# ⛩️ Torii — MCP Gateway

Torii is the MCP gateway component of [Keidai](https://app.notion.com/p/Keidai-Agent-Platform-38307ec181ff815b8276d59d005fd612) — the agent ecosystem monorepo. One endpoint for agents, fan-out to many backends. v0 is a long-lived proxy process + a config file, with structured traces to stdout/OTel and structured operational logs to stderr.

**Keidai** (境内) is the umbrella; **Torii** (鳥居, the gate) is this service. Torii owns access control and credential lifecycle at the MCP boundary. Agent identity (Fuda/AIdP) and execution (Shaiden/Runtime) live elsewhere in Keidai.

Design docs: [Torii — MCP Gateway](https://app.notion.com/p/38307ec181ff80e49dd8ff384139f8b2) · [Keidai — Agent Ecosystem](https://app.notion.com/p/38307ec181ff815b8276d59d005fd612)

## Stack

- **Runtime:** Node.js 24 (LTS)
- **Framework:** TypeScript, Fastify, tsyringe, official MCP SDK
- **Config:** `torii.yaml` at boot — no database
- **Shared types:** `@keidai/shared` (`packages/shared`)

## Layout

```
src/
  config/       # boot-time load, env resolution, ToriiConfigService
  connections/  # backend registry, connection state, MCP client connector
  catalog/      # fan-out tools/list, namespacing (server.tool)
  credentials/  # user_oauth / service_key / none credential resolvers + OAuth linking
  dispatch/     # route tools/call to the correct backend
  policy/       # group policy enforcement + approval gate, store, and API
  trace/        # structured CallTrace emission + Postgres trace store
  logging/      # structured operational logs (stderr)
  identity/     # inbound agent identity (Fuda JWT, validated offline against JWKS)
  storage/      # Postgres schema and connection
  http/         # Fastify server assembly, health, keidai-ui static serving
  mcp/          # inbound gateway MCP server (Fastify + SDK)
  container.ts  # tsyringe registrations
  index.ts      # process entry / boot sequence
```

## Getting started

From the monorepo root:

```bash
pnpm install
pnpm build
docker compose up postgres -d
cp apps/torii/.env.example apps/torii/.env   # set TORII_DATABASE_URL
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
| `TORII_UI_CLIENT_ROOT` | — | Legacy: path to built keidai-ui client (`dist/client`). Prefer the keidai-ui BFF as the public edge; leave unset in compose/k8s |
| `TORII_DATABASE_URL` | — | Required. Postgres connection string (OAuth tokens, provider clients, call traces, approval ledger) |
| `TORII_OPERATORS_PATH` | — | Optional `operators.yaml`. When set, boot wipes OAuth tokens and pending links for `owner_id`s absent from the registry. Unset is a no-op (never wipe without a registry). Compose/k8s pin this to the mounted operators file |
| `TORII_GATEWAY_BASE_URL` | — | Stable **public** base URL for OAuth callbacks (overrides per-request Host derivation). With the BFF edge, set this to the BFF origin (e.g. `http://localhost:3000`), not Torii's ClusterIP/`localhost:3100` |
| `TORII_FUDA_ISSUER` | — | Expected `iss` on Fuda-minted agent JWTs (required) |
| `TORII_FUDA_JWKS_URI` | — | Fuda JWKS URL, e.g. `http://127.0.0.1:3300/.well-known/jwks.json` (required) |

See `torii.example.yaml` at the repo root for server list, group definitions, OAuth providers, and agent registration shapes. Demo config: [`torii.demo.yaml`](torii.demo.yaml) in this package.

Optional `gateway_base_url` in torii.yaml (or `TORII_GATEWAY_BASE_URL`) sets the stable public URL used to derive OAuth callback URIs: `{base}/oauth/callback/{provider}`. Compose and kind both publish only keidai-ui (`:3000`); backends stay internal and the BFF reverse-proxies `/oauth/callback/*` to Torii.

## Agent identity

Inbound requests present a Fuda-minted agent identity JWT (`Authorization: Bearer …`). Torii validates it offline against Fuda's JWKS (`TORII_FUDA_*`): issuer, `aud=torii`, expiry, and signature. The principal (`agentId`, `ownerId`, `groups`, `bearerId`) is taken from token claims only — no registry lookup.

Tool allow/deny is keyed on the principal's `groups` against group definitions in `torii.yaml`. Unknown groups fail closed (deny + log `policy.unknown_group`).

Agent registration / subject validation lives in Fuda (token exchange). Torii calls Fuda for JWKS and nothing else.

## Trace feed API (UI)

The Activity & traces screen reads from HTTP endpoints backed by Postgres (`TORII_DATABASE_URL`). `call_traces` is range-partitioned by week; partitions older than 7 days are dropped (`KEIDAI_PARTITION_RETENTION_DAYS` to override). The API contract is store-agnostic so the backing implementation can move to an external observability backend later (OTel collector → time-series / log store) without UI changes.

Traces are listed with a UI cap of 200. Payloads include credential **refs** only — never token values or other secrets.

## OAuth linking (UI)

Link an owner's OAuth token before `user_oauth` backends can resolve credentials:

1. Start the stack with the BFF as the browser origin (`docker compose up`, `pnpm k8s:up`, or Torii + `pnpm --filter @keidai/keidai-ui dev`)
2. Open the UI at [http://localhost:3000](http://localhost:3000) → **OAuth providers**
3. Select the owner and click **Link account** for each provider

Torii derives the callback URL as `{gateway_base}/oauth/callback/{provider}`. Set `TORII_GATEWAY_BASE_URL` (or `gateway_base_url` in config) to the **BFF origin** so initiate returns a URL the browser and the IdP can both reach:

```text
http://localhost:3000/oauth/callback/{provider}
```

The BFF proxies `/oauth/callback/*` to Torii without an operator session. Do not register Torii's listen address (`:3100`) in provider consoles when the BFF is the only published surface.

### Provider console settings (GitHub / Google)

For **static** providers, register these on the OAuth app (same host you use to open the UI — prefer `localhost` over `127.0.0.1`, or register both):

| Field | Value |
|-------|--------|
| Authorized redirect / callback URI | `http://localhost:3000/oauth/callback/github` or `…/google` |
| Authorized JavaScript origin (Google) | `http://localhost:3000` |

**Dynamic** providers (Notion MCP) register the redirect URI automatically on first link.

Operator Google login (`KEIDAI_GOOGLE_*` on keidai-ui) is a separate client: redirect `http://localhost:3000/auth/callback`, origin `http://localhost:3000`.

The `owner_id` must match the registered agent's owner — tokens linked for a different owner will not resolve at call time.

Removing an operator from `operators.yaml` does not revoke IdP tokens by itself. Restart Torii (or roll the Deployment) so boot can wipe that `owner_id`'s rows from `oauth_tokens` and `pending_oauth_links`. Fuda's owner reconcile is separate and does not touch Torii's database. Compose and kind set `TORII_OPERATORS_PATH` to the mounted registry; a missing or invalid file fails boot rather than wiping grants. Unset `TORII_OPERATORS_PATH` skips the wipe.

In-cluster wiring: [`deploy/k8s/README.md`](../../deploy/k8s/README.md).

### Resetting stale OAuth data

If dynamic clients were registered with an old redirect URI, clear the rows and re-link:

```bash
psql "$TORII_DATABASE_URL" -c \
  "DELETE FROM oauth_provider_clients; DELETE FROM oauth_tokens;"
```

To wipe a single removed operator without waiting for the next boot reconcile:

```bash
psql "$TORII_DATABASE_URL" -c \
  "DELETE FROM oauth_tokens WHERE owner_id = 'the-owner-id';
   DELETE FROM pending_oauth_links WHERE owner_id = 'the-owner-id';"
```

## MCP Inspector (dev)

Browse Torii's tools, resources, and prompts in the browser during development.

**Prerequisite:** Torii must be running (e.g. `pnpm --filter @keidai/torii dev`, or `docker compose up` from the repo root).

```bash
pnpm --filter @keidai/torii dev:inspect
```

This launches [@modelcontextprotocol/inspector](https://github.com/modelcontextprotocol/inspector) via a local auth shim that injects `Authorization: Bearer <DEMO_AGENT_BEARER>` on every request to Torii. The bearer must be a Fuda-minted agent JWT (or a local demo token accepted by your Fuda subject validator). Without it, Torii returns `401` and the Inspector incorrectly attempts MCP OAuth — you will see **OAuth Authentication Failed**.

The Inspector UI opens automatically at `http://localhost:6274` (or prints the URL with a session token). Torii's MCP endpoint defaults to `http://127.0.0.1:3100/mcp`; override with `TORII_HOST` / `TORII_PORT` if needed.

## Demo harness

Torii runs alongside Fuda, Shaiden, and keidai-ui under Docker Compose from the repo root (only `:3000` is published):

```bash
docker compose up --build
```

Torii reads [`torii.demo.yaml`](torii.demo.yaml) and takes JWKS from Fuda. Create
agents/bearers/grants via keidai-ui (or Fuda's management API) before submitting
a task — Fuda boots with an empty agent registry.

For kind / OrbStack (projected SA tokens + ClusterIP backends), see [`deploy/k8s/README.md`](../../deploy/k8s/README.md).

## Docker

Prefer `docker compose up` from the monorepo root so the BFF is the public edge. Standalone Torii image (MCP/API only; no UI):

```bash
docker build -f apps/torii/Dockerfile -t torii .
docker run --rm -p 3100:3100 \
  -e GITHUB_CLIENT_ID=... -e GITHUB_CLIENT_SECRET=... \
  -e TORII_GATEWAY_BASE_URL=http://localhost:3000 \
  -e TORII_DATABASE_URL=postgres://torii:keidai-local@host.docker.internal:5432/torii \
  torii
```

Mount a custom config with `-v ./torii.yaml:/app/torii.yaml:ro`. Set `TORII_GATEWAY_BASE_URL` to the URL browsers and IdPs use for OAuth (the BFF when that is the only published surface).

## License

Apache-2.0

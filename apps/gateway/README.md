# ⛩️ Torii — MCP Gateway

Torii is the MCP gateway component of [Keidai](https://app.notion.com/p/Keidai-Agent-Platform-38307ec181ff815b8276d59d005fd612) — the agent platform monorepo. One endpoint for agents, fan-out to many backends. v0 is a long-lived proxy process + a config file, with structured traces to stdout/OTel.

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
cp apps/gateway/.env.example apps/gateway/.env   # edit as needed
cp torii.example.yaml torii.yaml                 # or use torii.demo.yaml for the demo
pnpm --filter @keidai/gateway dev
```

Environment variables load from the repo root `.env` (shared) then `apps/gateway/.env` (overrides). See [`.env.example`](.env.example) and the repo root [`.env.example`](../../.env.example).

Or run the built CLI:

```bash
pnpm --filter @keidai/gateway start
# equivalent: torii (bin name)
```

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `TORII_CONFIG_PATH` | `./torii.yaml` | Gateway config file |
| `TORII_PORT` | `3100` (falls back to `PORT`) | HTTP listen port |
| `TORII_HOST` | `127.0.0.1` | HTTP bind address |
| `TORII_TOKEN_STORE_PATH` | `./data/torii-tokens.db` | SQLite path for OAuth token store |
| `TORII_K8S_SA_OIDC_ISSUER` | — | K8s SA OIDC issuer (optional; enables JWT identity when set with audience + JWKS) |
| `TORII_K8S_SA_OIDC_AUDIENCE` | — | Expected JWT audience |
| `TORII_K8S_SA_OIDC_JWKS_URI` | — | JWKS endpoint for token verification |

See `torii.example.yaml` at the repo root for server list, policy, OAuth providers, and agent registration shapes. Demo config: [`torii.demo.yaml`](torii.demo.yaml) in this package.

## Agent identity

Inbound requests are authenticated via a single resolver wired at boot:

- **`agents[].inbound_token`** — static bearer declared in config (env refs resolved at load). Demo agents use this.
- **K8s SA OIDC** — when `TORII_K8S_SA_OIDC_*` env vars are all set, projected service account JWTs are also accepted and mapped via `agents[].subject`.

Backend OAuth for `user_oauth` servers is separate: tokens are persisted in SQLite via `torii link`, keyed by `(owner_id, provider)` from the resolved agent principal.

## OAuth linking (CLI)

Link an owner's OAuth token before `user_oauth` backends can resolve credentials:

```bash
# Requires oauth_providers + agents[] in torii.yaml
pnpm --filter @keidai/gateway run torii link github
pnpm --filter @keidai/gateway run torii link notion --owner demo-owner
```

The command opens a browser, completes the authorization-code flow on `http://127.0.0.1:8765/callback`, and persists tokens to SQLite keyed by `(owner_id, provider)`. The `owner_id` must match the registered agent's owner — tokens linked for a different owner will not resolve at call time.

Register redirect URIs in each provider's developer console. GitHub and Google use `http://127.0.0.1:8765/callback`. Notion requires HTTPS — use `https://127.0.0.1:8765/callback` (Torii serves a local self-signed certificate for the callback; your browser may warn once).

## MCP Inspector (dev)

Browse Torii's tools, resources, and prompts in the browser during development.

**Prerequisite:** Torii must be running (e.g. `pnpm --filter @keidai/gateway dev` or `pnpm demo:gateway` from the repo root).

```bash
pnpm --filter @keidai/gateway dev:inspect
```

This launches [@modelcontextprotocol/inspector](https://github.com/modelcontextprotocol/inspector) via a local auth shim that injects `Authorization: Bearer <DEMO_AGENT_BEARER>` on every request to Torii. Use the same bearer value as `agents[].inbound_token` in your `torii.yaml` (demo: `DEMO_AGENT_BEARER` in the repo root `.env`). Without it, Torii returns `401` and the Inspector incorrectly attempts MCP OAuth — you will see **OAuth Authentication Failed**.

The Inspector UI opens automatically at `http://localhost:6274` (or prints the URL with a session token). Torii's MCP endpoint defaults to `http://127.0.0.1:3100/mcp`; override with `TORII_HOST` / `TORII_PORT` if needed.

## Demo harness

See **[docs/demo.md](../../docs/demo.md)** for the full open-torii demo walkthrough.

```bash
pnpm demo:gateway   # from repo root
pnpm demo
```

## License

Apache-2.0

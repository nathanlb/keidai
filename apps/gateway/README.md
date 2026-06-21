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
cp torii.example.yaml torii.yaml   # edit backends as needed
pnpm --filter @keidai/gateway dev
```

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
| `TORII_TOKEN_STORE_PATH` | — | SQLite path for OAuth token store |
| `TORII_K8S_SA_OIDC_ISSUER` | — | K8s SA OIDC issuer (identity) |
| `TORII_K8S_SA_OIDC_AUDIENCE` | — | Expected JWT audience |
| `TORII_K8S_SA_OIDC_JWKS_URI` | — | JWKS endpoint for token verification |

See `torii.example.yaml` at the repo root for server list, policy, OAuth providers, and agent registration shapes.

## License

Apache-2.0

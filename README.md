# ⛩️ open-torii

open-torii is an MCP gateway — one endpoint for agents, fan-out to many backends. v0 is a long-lived proxy process + a config file, with structured traces to stdout/OTel.

## Stack

- **Runtime:** Node.js 24 (LTS)
- **Monorepo:** pnpm workspaces + Turborepo
- **Gateway:** TypeScript, Fastify, tsyringe, official MCP SDK
- **Config:** `torii.yaml` at boot — no database

## Layout

```
apps/gateway/       # proxy process (implementation TBD)
packages/shared/    # @torii/shared — config, catalog, trace types
torii.example.yaml  # example server list + policy
```

## Getting started

```bash
pnpm install
pnpm build
cp torii.example.yaml torii.yaml   # edit backends as needed
```

## License

Apache-2.0
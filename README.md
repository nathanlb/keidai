# 🏞️ Keidai — Agent Platform

Keidai (境内) is a self-hostable platform for securely configuring, running, and observing autonomous agents: who they are, what they may touch, and what they did.

**Torii** is the gate — the MCP gateway and control plane. It is the only component actively built in v0. Other Keidai components (Fuda/AIdP for agent identity, Shaiden/Runtime for execution) are sketched in [Notion](https://app.notion.com/p/Keidai-Agent-Platform-38307ec181ff815b8276d59d005fd612) so Torii is designed against a real system rather than in isolation.

## Stack

- **Runtime:** Node.js 24 (LTS)
- **Monorepo:** pnpm workspaces + Turborepo
- **Gateway (Torii):** TypeScript, Fastify, tsyringe, official MCP SDK — see [`apps/gateway/README.md`](apps/gateway/README.md)
- **Config:** `torii.yaml` at boot — no database

## Layout

```
apps/
  gateway/          # Torii — MCP gateway (see apps/gateway/README.md)
packages/
  shared/           # @keidai/shared — Torii config, catalog, trace types
torii.example.yaml  # example server list + policy
```

## Getting started

```bash
pnpm install
pnpm build
cp torii.example.yaml torii.yaml   # edit backends as needed
pnpm --filter @keidai/gateway dev
```

## Docs

- [Keidai — Agent Platform](https://app.notion.com/p/Keidai-Agent-Platform-38307ec181ff815b8276d59d005fd612) — ecosystem vision, component boundaries, v0 vs vX
- [Torii — MCP Gateway](https://app.notion.com/p/Torii-MCP-Gateway-36c07ec181ff813d8f34f9b0e617de34) — gateway contracts and implementation

## License

Apache-2.0

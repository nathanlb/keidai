# 🏞️ Keidai — Agent Ecosystem

Keidai (境内) is a self-hostable ecosystem for securely configuring, running, and observing autonomous agents: who they are, what they may touch, and what they did.

- **Torii** - the MCP gateway and control plane. (In Progress)
- **Fuda**- the agent registry and identity provider (Planned)
- **Shaiden** - the agent runtime and orchestration (Planned)
- **Keidai-UI** - the GUI to tie them all together ~and the the darkness bind them~ (Planned)

## Stack

- **Runtime:** Node.js 24 (LTS)
- **Monorepo:** pnpm workspaces + Turborepo
- **Gateway (Torii):** TypeScript, Fastify, tsyringe, official MCP SDK — see [`apps/torii/README.md`](apps/torii/README.md)
- **Config:** `torii.yaml` at boot — no database

## Layout

```
apps/
  torii/            # Torii — MCP gateway (see apps/torii/README.md)
  demo-agent/       # NAT-16 demo harness (see docs/demo.md)
packages/
  shared/           # @keidai/shared — Torii config, catalog, trace types, loadEnv
docs/
  demo.md           # how to run the open-torii demo end-to-end
torii.example.yaml  # example server list + policy
```

## Getting started

```bash
pnpm install
pnpm build
cp torii.example.yaml torii.yaml   # edit backends as needed
pnpm --filter @keidai/torii dev
```

## Demo

Full walkthrough (env setup, OAuth linking, three-terminal run): **[docs/demo.md](docs/demo.md)**

```bash
pnpm demo:torii   # terminal 1 (+ Gmail MCP — see docs)
pnpm demo           # terminal 2
```

## Docs

- [Keidai — Agent Ecosystem](https://app.notion.com/p/Keidai-Agent-Platform-38307ec181ff815b8276d59d005fd612) — ecosystem vision, component boundaries, v0 vs vX
- [Torii — MCP Gateway](https://app.notion.com/p/Torii-MCP-Gateway-36c07ec181ff813d8f34f9b0e617de34) — gateway contracts and implementation

## License

Apache-2.0

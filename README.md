# 🏞️ Keidai — Agent Ecosystem

Keidai (境内) is a self-hostable ecosystem for securely configuring, running, and observing autonomous agents: who they are, what they may touch, and what they did.

- **Torii** - the MCP gateway and control plane. (In Progress)
- **Fuda** - the agent registry and identity provider (In Progress)
- **Shaiden** - the agent runtime and orchestration (In Progress)
- **Keidai-UI** - the GUI to tie them all together ~and the the darkness bind them~ (Planned)

## Stack

- **Runtime:** Node.js 24 (LTS)
- **Monorepo:** pnpm workspaces + Turborepo
- **Gateway (Torii):** TypeScript, Fastify, tsyringe, official MCP SDK — see [`apps/torii/README.md`](apps/torii/README.md)
- **AIdP (Fuda):** TypeScript, Fastify, tsyringe, SQLite — see [`apps/fuda/README.md`](apps/fuda/README.md)
- **Config:** `torii.yaml` at boot for Torii; Fuda uses env + SQLite migrations

## Layout

```
apps/
  keidai-ui/        # Web UI for managing and controlling the Keidai ecosystem
  fuda/             # Fuda - Agent Identity Provider (AIdP)
  shaiden/          # Shaiden - Agent runtime for the ecosystem
  torii/            # Torii - MCP gateway (see apps/torii/README.md)
packages/
  shared/           # @keidai/shared - Torii config, catalog, trace types, loadEnv
  ui/               # @keidai/ui - Shared shadcn-based UI component library
docs/
  testing.md        # testing strategy and layout
torii.example.yaml  # example server list + groups
docker-compose.yml  # Fuda + Torii + Shaiden
```

## Getting started

```bash
pnpm install
pnpm build
cp torii.example.yaml torii.yaml   # edit backends as needed
pnpm --filter @keidai/torii dev
```

## Demo

The whole stack runs under Docker Compose: Fuda on `:3300`, Torii on `:3100` (also serving keidai-ui), Shaiden on `:3200`.

```bash
docker compose up --build
```

Fuda starts with an empty agent registry. Set `FUDA_OPERATORS_PATH` so owners
reconcile at boot, then create agents/bearers/grants via keidai-ui (or the
management API) before submitting a task — otherwise token exchange fails.
Requires a signing key at `apps/fuda/keys/dev.pem` plus `SHAIDEN_BEARER`, `FUDA_ISSUER`, and the demo backend secrets in the repo root `.env` (see [`.env.example`](.env.example)). Per-service setup: [`apps/fuda/README.md`](apps/fuda/README.md), [`apps/torii/README.md`](apps/torii/README.md), [`apps/shaiden/README.md`](apps/shaiden/README.md).

## Docs

- [Keidai — Agent Ecosystem](https://app.notion.com/p/38307ec181ff815b8276d59d005fd612) — ecosystem vision, component boundaries, v0 vs vX
- [Torii — MCP Gateway](https://app.notion.com/p/38307ec181ff80e49dd8ff384139f8b2) — gateway contracts, config, policy, and approval gates
- [Fuda — Agent Identity Provider](https://app.notion.com/p/38307ec181ff81529d0dee3c0c09238f) — token exchange, registry, and the subject-token seam
- [Shaiden — Agent Runtime](https://app.notion.com/p/38307ec181ff81d8833cf4e05f6b8437) — task loop, termination outcomes, approval parking
- [keidai-ui — Frontend](https://app.notion.com/p/38507ec181ff81b38d8df7349de05381) — operator surface and module boundaries
- [docs/testing.md](docs/testing.md) — testing strategy and layout

## License

Apache-2.0

# 🏞️ Keidai — Agent Ecosystem

Keidai (境内) is a self-hostable ecosystem for securely configuring, running, and observing autonomous agents: who they are, what they may touch, and what they did.

- **Torii** - the MCP gateway and control plane. (In Progress)
- **Fuda** - the agent registry and identity provider (In Progress)
- **Shaiden** - the agent runtime and orchestration (In Progress)
- **Keidai-UI** - the operator BFF + SPA (In Progress)

## Stack

- **Runtime:** Node.js 24 (LTS)
- **Monorepo:** pnpm workspaces + Turborepo
- **Gateway (Torii):** TypeScript, Fastify, tsyringe, official MCP SDK — see [`apps/torii/README.md`](apps/torii/README.md)
- **AIdP (Fuda):** TypeScript, Fastify, tsyringe, SQLite — see [`apps/fuda/README.md`](apps/fuda/README.md)
- **Config:** `torii.yaml` at boot for Torii; Fuda uses env + SQLite migrations; operators live in `deploy/operators.example.yaml`

## Layout

```
apps/
  keidai-ui/        # Operator BFF + SPA (sole published HTTP edge)
  fuda/             # Fuda - Agent Identity Provider (AIdP)
  shaiden/          # Shaiden - Agent runtime for the ecosystem
  torii/            # Torii - MCP gateway (see apps/torii/README.md)
packages/
  shared/           # @keidai/shared - Torii config, catalog, trace types, loadEnv
  ui/               # @keidai/ui - Shared shadcn-based UI component library
deploy/
  operators.example.yaml  # Google ↔ opaque owner_id registry (SSOT)
  k8s/              # In-cluster bring-up (kind / OrbStack)
docs/
  testing.md        # testing strategy and layout
torii.example.yaml  # example server list + groups
docker-compose.yml  # Fuda + Torii + Shaiden + keidai-ui (publishes :3000 only)
```

## Getting started

```bash
pnpm install
pnpm build
cp torii.example.yaml torii.yaml   # edit backends as needed
pnpm --filter @keidai/torii dev
```

Day-to-day local UI: run Fuda/Torii/Shaiden, then `pnpm ui:dev` (Vite `:3000` + API-only BFF `:3001`). See [`apps/keidai-ui/README.md`](apps/keidai-ui/README.md).

## Demo

Docker Compose brings up the full stack and publishes **only** the keidai-ui BFF on `:3000`. Fuda (`:3300`), Torii (`:3100`), and Shaiden (`:3200`) stay on the Compose network.

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) and sign in with an allowlisted Google operator (`deploy/operators.example.yaml`, mounted into Fuda + BFF). Create agents/bearers/grants via keidai-ui before submitting a Shaiden task — otherwise token exchange fails.

Requires a signing key at `apps/fuda/keys/dev.pem` plus `SHAIDEN_BEARER`, `FUDA_ISSUER`, Google OIDC secrets for the BFF, and demo backend secrets in the repo root `.env` / `apps/keidai-ui/.env` (see [`.env.example`](.env.example) and [`apps/keidai-ui/.env.example`](apps/keidai-ui/.env.example)). Per-service setup: [`apps/fuda/README.md`](apps/fuda/README.md), [`apps/torii/README.md`](apps/torii/README.md), [`apps/shaiden/README.md`](apps/shaiden/README.md), [`apps/keidai-ui/README.md`](apps/keidai-ui/README.md). In-cluster: [`deploy/k8s/README.md`](deploy/k8s/README.md).

## Docs

- [Keidai — Agent Ecosystem](https://app.notion.com/p/38307ec181ff815b8276d59d005fd612) — ecosystem vision, component boundaries, v0 vs vX
- [Torii — MCP Gateway](https://app.notion.com/p/38307ec181ff80e49dd8ff384139f8b2) — gateway contracts, config, policy, and approval gates
- [Fuda — Agent Identity Provider](https://app.notion.com/p/38307ec181ff81529d0dee3c0c09238f) — token exchange, registry, and the subject-token seam
- [Shaiden — Agent Runtime](https://app.notion.com/p/38307ec181ff81d8833cf4e05f6b8437) — task loop, termination outcomes, approval parking
- [keidai-ui — Frontend](https://app.notion.com/p/38507ec181ff81b38d8df7349de05381) — operator surface and module boundaries
- [docs/testing.md](docs/testing.md) — testing strategy and layout

## License

Apache-2.0

# 🏞️ Keidai — Agent Ecosystem

Keidai (境内) is a self-hostable ecosystem for securely configuring, running, and observing autonomous agents: who they are, what they may touch, and what they did.

- **Torii** - the MCP gateway and control plane
- **Fuda** - the agent registry and identity provider
- **Shaiden** - the agent runtime and orchestration
- **Keidai-UI** - the operator BFF + SPA

## Stack

- **Runtime:** Node.js 24 (LTS)
- **Monorepo:** pnpm workspaces + Turborepo
- **Gateway (Torii):** TypeScript, Fastify, tsyringe, official MCP SDK — see [`apps/torii/README.md`](apps/torii/README.md)
- **AIdP (Fuda):** TypeScript, Fastify, tsyringe, Postgres — see [`apps/fuda/README.md`](apps/fuda/README.md)
- **Config:** connectors and group policy are authored in keidai-ui and stored in Postgres; Fuda uses env + Postgres migrations; operators live in `deploy/operators.example.yaml`

## Layout

```
apps/
  keidai-ui/        # Operator BFF + SPA (sole published HTTP edge)
  fuda/             # Fuda - Agent Identity Provider (AIdP)
  shaiden/          # Shaiden - Agent runtime for the ecosystem
  torii/            # Torii - MCP gateway (see apps/torii/README.md)
packages/
  shared/           # @keidai/shared - Torii config, catalog, trace types, loadEnv
  postgres/         # @keidai/postgres - Pool, migrations, transactions, test schemas
  ui/               # @keidai/ui - Shared shadcn-based UI component library
deploy/
  operators.example.yaml  # Google ↔ opaque owner_id registry (SSOT)
  postgres/         # Init script: three logical DBs and roles
  k8s/              # In-cluster bring-up (kind / OrbStack; single Postgres)
docs/
  README.md         # public documentation index
docker-compose.yml  # Fuda + Torii + Shaiden + keidai-ui (publishes :3000 only)
```

## Getting started

The recommended first run is Docker Compose. It publishes only the keidai-ui
operator edge at `http://localhost:3000`.

```bash
pnpm install
docker compose up --build
```

Before starting, configure the operator registry, required secrets, and Fuda
development signing key. Follow the [full getting-started guide](docs/getting-started.md)
for Compose, native local development, and Kubernetes.

## Releasing

Keidai uses a single platform semver across all workspace packages and the Helm
chart. Releases are maintainer-driven from GitHub Actions:

1. Actions → **Prepare release** → choose bump type (and optional extra notes).
   This opens one **Release** PR with the version bump and a changelog built
   from conventional commits since the last `v*` tag.
2. Review and merge that PR. Merging tags `v{semver}` and publishes GHCR images
   plus the Helm chart (`oci://ghcr.io/<owner>/keidai`).

Verify alignment anytime with `pnpm check-versions`. See
[deploy/k8s/README.md](deploy/k8s/README.md) for image and chart distribution.

## Docs

- [Documentation index](docs/README.md)
- [Architecture](docs/architecture.md)
- [Operations](docs/operations.md)
- [Install on k3s](deploy/k8s/install-k3s.md)
- [Deployment reference](docs/reference.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Testing](docs/testing.md)

## License

Apache-2.0

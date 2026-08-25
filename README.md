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
- **Config:** `torii.yaml` at boot for Torii; Fuda uses env + Postgres migrations; operators live in `deploy/operators.example.yaml`

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
torii.example.yaml  # example server list + groups
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
chart. To release:

1. On a feature PR with user-facing or deployable changes, run `pnpm changeset`
   and commit the generated file in `.changeset/`.
2. Merge to `main`. The release workflow opens a **Version Packages** PR when
   pending changesets exist.
3. Merge the Version Packages PR. That bumps versions, updates changelogs,
   creates git tag `v{semver}`, and publishes GHCR images.

Verify alignment anytime with `pnpm check-versions`. See
[deploy/k8s/README.md](deploy/k8s/README.md) for image distribution.

## Docs

- [Documentation index](docs/README.md)
- [Architecture](docs/architecture.md)
- [Operations](docs/operations.md)
- [Deployment reference](docs/reference.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Testing](docs/testing.md)

## License

Apache-2.0

# Fuda

Agent Identity Provider (AIdP) for the Keidai ecosystem. Source of record for agent identity and definition, and the signing authority for agent tokens.

## Surfaces

HTTP route groups are structurally separate so they can be exposed independently at the network layer:

| Group | Purpose | Examples (later stories) |
|-------|---------|--------------------------|
| `public` | Unauthenticated discovery | JWKS (`/.well-known/jwks.json`) |
| `agent` | Agent / runtime facing | Token exchange (`POST /token`) |
| `management` | Operator / UI facing | Agent CRUD |

By default one process listens on `127.0.0.1:3300` with all groups. To expose JWKS without management, run a process with `FUDA_LISTEN_GROUPS=public` (optionally on its own port).

## Local development

```bash
# From repo root
cp apps/fuda/.env.example apps/fuda/.env
pnpm install
pnpm fuda:dev
```

Health: `GET /api/health` → `{ ok, version }`.

SQLite path defaults to `./data/fuda.db` (`FUDA_DB_PATH`). Migrations run at boot before the HTTP server starts.

## Config

| Variable | Default | Notes |
|----------|---------|-------|
| `FUDA_HOST` | `127.0.0.1` | Bind address |
| `FUDA_PORT` | `3300` | Listen port |
| `FUDA_DB_PATH` | `./data/fuda.db` | SQLite file |
| `FUDA_LISTEN_GROUPS` | `public,agent,management` | Subset of route groups this process serves |

Invalid config fails fast at boot.

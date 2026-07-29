# Fuda

Agent Identity Provider (AIdP) for the Keidai ecosystem. Source of record for agent identity and definition, and the signing authority for agent tokens.

## Surfaces

HTTP route groups are structurally separate so they can be exposed independently at the network layer:

| Group | Purpose | Examples |
|-------|---------|----------|
| `public` | Unauthenticated discovery | JWKS (`/.well-known/jwks.json`) — later |
| `agent` | Agent / runtime facing | Definition view (`GET /agents/{id}`), token exchange (later) |
| `management` | Operator / UI facing | Agent / bearer CRUD (`/api/agents`, `/api/bearers`) |

By default one process listens on `127.0.0.1:3300` with all groups. To expose JWKS without management, run a process with `FUDA_LISTEN_GROUPS=public` (optionally on its own port). Management is unauthenticated in v0 and expects localhost bind.

## Local development

```bash
# From repo root
cp apps/fuda/.env.example apps/fuda/.env
pnpm install
pnpm fuda:dev
```

Health: `GET /api/health` → `{ ok, version }`.

SQLite path defaults to `./data/fuda.db` (`FUDA_DB_PATH`). Migrations run at boot before the HTTP server starts, then structural integrity is checked (duplicate slugs, orphan grants).

### Management API

Unauthenticated; intended for keidai-ui on localhost.

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/agents` | List agents (includes `ownerId`, `groups`, current `persona`) |
| `POST` | `/api/agents` | Create (`slug`, `name`, `ownerId`, `groups`, `persona`; optional `id`) |
| `GET` | `/api/agents/:id` | Full management record |
| `PATCH` | `/api/agents/:id` | Update `name`, `groups`, and/or `persona` (persona appends a version). `slug` / `ownerId` immutable |
| `DELETE` | `/api/agents/:id` | Deletes agent, personas, and grants |
| `GET` | `/api/agents/:id/grants` | Grants authorizing bearers for this agent |
| `GET` | `/api/bearers` | List bearers |
| `POST` | `/api/bearers` | Create (`bearerId`, `displayName`) |
| `GET` | `/api/bearers/:id` | Bearer plus grants |
| `PATCH` | `/api/bearers/:id` | Update `displayName` |
| `DELETE` | `/api/bearers/:id` | Deletes bearer and grants |
| `POST` | `/api/bearers/:id/grants` | Grant `{ agentId }` |
| `DELETE` | `/api/bearers/:id/grants/:agentId` | Revoke grant |

Duplicate `slug` → `409` `{ error: "agent slug already exists" }`. Group values are opaque strings; Fuda does not validate them against Torii.

### Definition view

Consumed by Shaiden at task start (`FUDA_LISTEN_GROUPS` must include `agent`):

`GET /agents/:id` → `{ name, slug, persona, personaVersion }` — no `ownerId` / `groups`.

### Data model

| Table | Notes |
|-------|-------|
| `agents` | `id`, unique immutable `slug`, editable `name`, `owner_id`, opaque `groups`, pointer to current persona version |
| `persona_versions` | Append-only (`agent_id`, `version`, `content`). Edits insert a new row |
| `bearers` | `{ bearer_id, display_name }` only — credential mapping lives in the subject validator |
| `bearer_agent_grants` | Join table authorizing a bearer to act as an agent |

## Config

| Variable | Default | Notes |
|----------|---------|-------|
| `FUDA_HOST` | `127.0.0.1` | Bind address |
| `FUDA_PORT` | `3300` | Listen port |
| `FUDA_DB_PATH` | `./data/fuda.db` | SQLite file |
| `FUDA_LISTEN_GROUPS` | `public,agent,management` | Subset of route groups this process serves |

Invalid config fails fast at boot.

# Fuda

Agent Identity Provider (AIdP) for the Keidai ecosystem. Source of record for agent identity and definition, and the signing authority for agent tokens.

## Surfaces

HTTP route groups are structurally separate so they can be exposed independently at the network layer:

| Group | Purpose | Examples |
|-------|---------|----------|
| `public` | Unauthenticated discovery | JWKS (`GET /.well-known/jwks.json`) |
| `agent` | Agent / runtime facing | Definition view (`GET /agents/{id}`), token exchange (later) |
| `management` | Operator / UI facing | Agent / bearer CRUD (`/api/agents`, `/api/bearers`) |

By default one process listens on `127.0.0.1:3300` with all groups. To expose JWKS without management, run a process with `FUDA_LISTEN_GROUPS=public` (optionally on its own port). Management is unauthenticated in v0 and expects localhost bind.

## Local development

```bash
# From repo root
cp apps/fuda/.env.example apps/fuda/.env

# Generate an RSA signing key (never commit private keys)
mkdir -p apps/fuda/keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out apps/fuda/keys/dev.pem
chmod 600 apps/fuda/keys/dev.pem

# In apps/fuda/.env:
# FUDA_SIGNING_KEYS=dev=./keys/dev.pem
# FUDA_SIGNING_KID=dev
# FUDA_STATIC_SUBJECT_MAPPINGS=dev-secret=local-dev

pnpm install
pnpm fuda:dev
```

Health: `GET /api/health` → `{ ok, version }`.

JWKS: `GET /.well-known/jwks.json` → `{ keys: [...] }` (unauthenticated; public route group).

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

## Subject token validators

The token exchange endpoint (later) validates a platform credential via
`SubjectTokenValidator` and receives only a `bearer_id`. Native credential
subjects never enter the schema or grant check — that is what keeps a second
validator (k8s SA OIDC, SPIFFE) an addition rather than a refactor.

| Variable | Notes |
|----------|-------|
| `FUDA_STATIC_SUBJECT_MAPPINGS` | `credential=bearer_id` list for local/pre-cluster use |
| `FUDA_K8S_SA_OIDC_ISSUER` / `_AUDIENCE` / `_JWKS_URI` / `_SUBJECT_MAPPINGS` | Set all four together. Audience should be `fuda` (projected volume `aud`). Mappings: `namespace/serviceAccount=bearer_id,...` |

Exactly one config group may be set. Partial k8s env fails at boot; setting
both static and k8s is ambiguous and also fails. Required when
`FUDA_LISTEN_GROUPS` includes `agent`.

The k8s SA OIDC validator is **unit-tested** against a mocked JWKS (optional
`verifyKey` inject). Cluster integration coverage is pending.

## Signing keys and JWKS

Private signing keys are loaded at boot from files (prefer mode `0600`) or env vars — never from sqlite. Tokens are signed RS256 with `kid` in the JWT header. Torii validates offline against `GET /.well-known/jwks.json`.

| Variable | Notes |
|----------|-------|
| `FUDA_SIGNING_KEYS` | Comma-separated `kid=path` or `kid=env:VAR_NAME` entries (one or two during rotation) |
| `FUDA_SIGNING_KID` | Kid used to mint new tokens; must appear in `FUDA_SIGNING_KEYS` |

### Key rotation (manual)

Order is **publish → sign → retire**. Do not reverse these steps.

1. **Publish.** Generate a new RSA private key, place it with restrictive permissions, add its `kid=path` to `FUDA_SIGNING_KEYS` alongside the current key. Keep `FUDA_SIGNING_KID` on the old kid. Restart. Confirm the new public key appears in JWKS.
2. **Sign.** Set `FUDA_SIGNING_KID` to the new kid. Restart. New tokens use the new key; in-flight tokens signed with the old key still verify because both keys remain in JWKS.
3. **Retire.** Wait at least the maximum token TTL (5 minutes proposed for token exchange). Remove the old `kid=path` from `FUDA_SIGNING_KEYS`. Restart. Old-key tokens will no longer verify.

Automated rotation scheduling is out of scope for v0.

## Config

| Variable | Default | Notes |
|----------|---------|-------|
| `FUDA_HOST` | `127.0.0.1` | Bind address |
| `FUDA_PORT` | `3300` | Listen port |
| `FUDA_DB_PATH` | `./data/fuda.db` | SQLite file |
| `FUDA_LISTEN_GROUPS` | `public,agent,management` | Subset of route groups this process serves |
| `FUDA_SIGNING_KEYS` | — | Required. `kid=path` or `kid=env:VAR` list |
| `FUDA_SIGNING_KID` | — | Required. Active signing kid |
| `FUDA_STATIC_SUBJECT_MAPPINGS` | — | Subject-validator config group (alternative: `FUDA_K8S_SA_OIDC_*`). Exactly one group required when `agent` is enabled. `credential=bearer_id` list |
| `FUDA_K8S_SA_OIDC_ISSUER` | — | K8s SA OIDC issuer (with audience, JWKS, subject mappings) |
| `FUDA_K8S_SA_OIDC_AUDIENCE` | — | Expected JWT audience (deploy projected volume with `aud=fuda`) |
| `FUDA_K8S_SA_OIDC_JWKS_URI` | — | Cluster JWKS endpoint |
| `FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS` | — | `namespace/serviceAccount=bearer_id` list (validator-private) |

Invalid config fails fast at boot.

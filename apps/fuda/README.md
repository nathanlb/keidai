# Fuda

Agent Identity Provider (AIdP) for the Keidai ecosystem. Source of record for agent identity and definition, and the signing authority for agent tokens.

## Surfaces

HTTP route groups are structurally separate so they can be exposed independently at the network layer:

| Group | Purpose | Examples |
|-------|---------|----------|
| `public` | Unauthenticated discovery | JWKS (`GET /.well-known/jwks.json`) |
| `agent` | Agent / runtime facing | Definition view (`GET /agents/{id}`), token exchange (`POST /token`) |
| `management` | Operator / UI facing | Agent / bearer CRUD (`/api/agents`, `/api/bearers`) |

By default one process listens on `127.0.0.1:3300` with all groups. To expose JWKS without management, run a process with `FUDA_LISTEN_GROUPS=public` (optionally on its own port). Management `/api/*` requires `BFF_SERVICE_TOKEN` (`Authorization: Bearer <token>`; keidai-ui injects it). Opt out with `BFF_SERVICE_TOKEN_DISABLED=true` for local unit tests only.

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
# FUDA_ISSUER=https://fuda.local
# FUDA_STATIC_SUBJECT_MAPPINGS=dev-secret=local-dev

pnpm install
pnpm fuda:dev
```

Health: `GET /api/health` → `{ ok, version }`.

JWKS: `GET /.well-known/jwks.json` → `{ keys: [...] }` (unauthenticated; public route group).

SQLite path defaults to `./data/fuda.db` (`FUDA_DB_PATH`). Migrations run at boot before the HTTP server starts, then structural integrity is checked (duplicate slugs, orphan grants).

When `FUDA_OPERATORS_PATH` points at an `operators.yaml`, Fuda reconciles the `owners` table at boot (upsert listed owners; delete absent ones and cascade their agents). Torii separately wipes that `owner_id`'s OAuth tokens when `TORII_OPERATORS_PATH` is set — restart Torii after editing the registry. Create agents, bearers, and grants through the management API / keidai-ui — there is no config-based seed in the server.

### Management API

Protected by `BFF_SERVICE_TOKEN` (required; Bearer on `/api/agents` and `/api/bearers`). Intended for keidai-ui; generate with `openssl rand -hex 32` and share via the root `.env`. Set `BFF_SERVICE_TOKEN_DISABLED=true` only to opt out locally.

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

### Token exchange

`POST /token` exchanges a platform subject token for a short-lived agent identity JWT (`FUDA_LISTEN_GROUPS` must include `agent`):

```json
// request
{ "subject_token": "...", "agent_id": "..." }

// 200 response
{ "access_token": "<jwt>", "token_type": "Bearer", "expires_in": 300 }
```

Flow: validate subject → `bearer_id`, look up agent, require a `bearer_agent_grants` row, mint JWT.

JWT claims (pinned at mint): `agent_id`, `owner_id`, `groups`, `bearer_id`, plus `iss` (`FUDA_ISSUER`), `aud=torii`, `iat`/`exp` (5 minute TTL). Signed RS256 with the current signing kid.

| Status | Error | Meaning |
|--------|-------|---------|
| `400` | `invalid token exchange request` | Missing / malformed body |
| `401` | `invalid subject token` | Subject validator rejected the credential |
| `403` | `bearer not granted for agent` | Valid bearer, no grant for that agent |
| `404` | `agent not found` | Unknown `agent_id` |

Not an OAuth2 authorization server: no authorization code, consent, refresh tokens, or PKCE. Torii continues to broker tool credentials; Fuda mints identity only.

### Data model

| Table | Notes |
|-------|-------|
| `agents` | `id`, unique immutable `slug`, editable `name`, `owner_id`, opaque `groups`, pointer to current persona version |
| `persona_versions` | Append-only (`agent_id`, `version`, `content`). Edits insert a new row |
| `bearers` | `{ bearer_id, display_name }` only — credential mapping lives in the subject validator |
| `bearer_agent_grants` | Join table authorizing a bearer to act as an agent |

## Subject token validators

The token exchange endpoint validates a platform credential via
`SubjectTokenValidator` and receives only a `bearer_id`. Native credential
subjects never enter the schema or grant check — that is what keeps a second
validator (k8s SA OIDC, SPIFFE) an addition rather than a refactor.

| Variable | Notes |
|----------|-------|
| `FUDA_STATIC_SUBJECT_MAPPINGS` | `credential=bearer_id` list for local/pre-cluster use |
| `FUDA_K8S_SA_OIDC_ISSUER` / `_AUDIENCE` / `_JWKS_URI` / `_SUBJECT_MAPPINGS` | Set all four together. Audience should be `fuda` (projected volume `aud`). Mappings: `namespace/serviceAccount=bearer_id,...` |
| `FUDA_K8S_SA_OIDC_JWKS_BEARER_TOKEN_FILE` | Optional. Defaults to the in-cluster SA token path. Required in practice on clusters that disable anonymous JWKS access (e.g. OrbStack). |

Exactly one config group may be set. Partial k8s env fails at boot; setting
both static and k8s is ambiguous and also fails. Required when
`FUDA_LISTEN_GROUPS` includes `agent`.

The k8s SA OIDC validator is **unit-tested** against a mocked JWKS (optional
`verifyKey` inject). For cluster deploy (projected SA tokens + kind), see
[`deploy/k8s/README.md`](../../deploy/k8s/README.md).

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
3. **Retire.** Wait at least the maximum token TTL (5 minutes). Remove the old `kid=path` from `FUDA_SIGNING_KEYS`. Restart. Old-key tokens will no longer verify.

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
| `FUDA_ISSUER` | — | Required. Absolute URL used as JWT `iss` |
| `FUDA_STATIC_SUBJECT_MAPPINGS` | — | Subject-validator config group (alternative: `FUDA_K8S_SA_OIDC_*`). Exactly one group required when `agent` is enabled. `credential=bearer_id` list |
| `FUDA_K8S_SA_OIDC_ISSUER` | — | K8s SA OIDC issuer (with audience, JWKS, subject mappings) |
| `FUDA_K8S_SA_OIDC_AUDIENCE` | — | Expected JWT audience (deploy projected volume with `aud=fuda`) |
| `FUDA_K8S_SA_OIDC_JWKS_URI` | — | Cluster JWKS endpoint |
| `FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS` | — | `namespace/serviceAccount=bearer_id` list (validator-private) |
| `FUDA_K8S_SA_OIDC_JWKS_BEARER_TOKEN_FILE` | in-cluster SA token | Optional. Bearer used when fetching JWKS (many clusters reject anonymous JWKS with 401) |

Invalid config fails fast at boot.

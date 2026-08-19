# Keidai on Kubernetes

Local deploy of Fuda, Torii, Shaiden, and **keidai-ui** (BFF + SPA).
Only the BFF is published on the host. Backends are ClusterIP-only. Shaiden
authenticates to Fuda with a projected service-account token (`aud=fuda`).

```text
Browser → keidai-ui:3000 (SPA, /auth/*, /api/*, /oauth/callback/*)
            ├─ Torii   :3100  (2 replicas, ClusterIP round-robin)
            ├─ Fuda    :3300
            └─ Shaiden :3200  ──SA JWT──▶ Fuda /token ──JWT──▶ Torii /mcp
```

## Layout

| Path | Role |
|------|------|
| [`base/`](base/) | Portable manifests (Deployments, Services, PVCs, SA projection) |
| [`overlays/kind/`](overlays/kind/) | kind: `imagePullPolicy: Never`, BFF `hostPort`, cluster config |
| [`overlays/orbstack/`](overlays/orbstack/) | OrbStack: BFF `LoadBalancer`; Postgres uses the cluster PVC |

GKE (and other cloud) overlays are intentionally separate and not included yet.

## Prerequisites

- Docker (or OrbStack’s Docker)
- `kubectl`
- `openssl` (signing key generation if `apps/fuda/keys/dev.pem` is missing)
- **kind** overlay: [kind](https://kind.sigs.k8s.io/)
- **orbstack** overlay: [OrbStack](https://orbstack.dev/) with Kubernetes enabled
- Google OAuth client for **operator login** (redirect URI
  `http://localhost:3000/auth/callback`)
- OpenRouter API key (Shaiden runs)

## Quick start

```bash
cp deploy/k8s/secrets.example.env deploy/k8s/secrets.env
# Fill KEIDAI_GOOGLE_*, KEIDAI_SESSION_SECRET (≥32 chars), OPEN_ROUTER_API_KEY,
# and BFF_SERVICE_TOKEN (`openssl rand -hex 32`).
# Operators default to deploy/operators.example.yaml (override with KEIDAI_OPERATORS_FILE).

# Default local path (kind):
pnpm k8s:up
# or explicitly:
pnpm k8s:up:kind

# OrbStack (uses current kubectl context; must look like orbstack):
pnpm k8s:up:orbstack
```

Open [http://localhost:3000](http://localhost:3000) and sign in via
`/auth/login`.

Tear down:

```bash
pnpm k8s:down          # or: pnpm k8s:down:orbstack
KEIDAI_DELETE_CLUSTER=1 pnpm k8s:down   # also delete the kind cluster
```

## Persistence

One Postgres instance in the `keidai` namespace (`postgres:16-alpine`, ClusterIP
`postgres:5432`) with three logical databases and roles: `fuda`, `torii`,
`shaiden`. Connection strings are written into Secret `keidai-secrets` by
`up.sh` from `POSTGRES_PASSWORD` (default `keidai-local`). Apps fail closed if
`*_DATABASE_URL` is missing. `/api/health` fails if the pool cannot `SELECT 1`.

Traces (`call_traces`) and Shaiden `run_steps` are weekly range-partitioned;
partitions older than 7 days are dropped (`KEIDAI_PARTITION_RETENTION_DAYS`).
Torii runs two replicas behind ClusterIP `service/torii` (see
[Torii replicas](#torii-replicas)). Fuda, Shaiden, keidai-ui, and Postgres
stay at 1. High availability (CloudNativePG, standby, object-storage PITR)
is a later GCP deploy (NAT-160), not this local overlay.

Wiping the `postgres-data` PVC (or deleting the kind node) resets local data.
There is no SQLite dump converter.

## What `k8s:up` does

1. Ensures the cluster for the overlay (creates kind, or checks OrbStack context).
2. `docker compose build` (kind then `kind load`; OrbStack reuses local images).
3. Creates Secrets `fuda-signing` and `keidai-secrets` from `secrets.env`.
4. `kubectl apply -k deploy/k8s/overlays/<overlay>`.
5. Patches `FUDA_K8S_SA_OIDC_ISSUER` from cluster OIDC discovery when available.
6. Waits for Deployments and prints the UI URL.

Apply without the helper script:

```bash
kubectl apply -k deploy/k8s/overlays/kind
# or
kubectl apply -k deploy/k8s/overlays/orbstack
```

(You still need the Secrets from `up.sh` or an equivalent.)

## Smoke

Only the BFF is on the host; Fuda, Torii, and Shaiden stay ClusterIP.

- Sign in at `/auth/login`. The SPA should load; `/api/agents` and
  `/api/config` work same-origin.
- Fuda uses k8s SA OIDC (not static mappings):

  ```bash
  kubectl -n keidai exec deploy/fuda -- printenv FUDA_K8S_SA_OIDC_AUDIENCE
  ```

- Shaiden presents a projected SA token:

  ```bash
  kubectl -n keidai exec deploy/shaiden -- head -c 20 /var/run/secrets/tokens/token
  ```

- Start a Shaiden run from the UI; token exchange + Torii MCP should succeed.
- Torii OAuth link callbacks hit `http://localhost:3000/oauth/callback/...`.

Replica-specific checks are under [Torii replicas](#torii-replicas).

## Torii replicas

`base/torii.yaml` sets `spec.replicas: 2`. kind and OrbStack overlays inherit
that count. `service/torii` stays ClusterIP with `sessionAffinity: None` —
kube-proxy round-robins TCP connections; there is no sticky session.

Approvals, MCP tasks, OAuth tokens, and `call_traces` live in the shared
`torii` Postgres database (`TORII_DATABASE_URL`). The MCP path is
replica-agnostic: an operator approve via the BFF and a Shaiden `tasks/get`
poll can hit different pods and still complete a gated run. Deleting one
Torii pod does not drop those rows; the remaining replica serves them.

Known leftovers (not this overlay):

- Operator SSE is process-local. An operator whose BFF lands on replica A
  will not live-stream traces emitted on replica B. List/get still read
  Postgres, so history is shared.
- Each replica opens its own backend MCP clients (connection count × replica
  count).

Fuda, Shaiden, and keidai-ui stay at one replica.

### Smoke

After `pnpm k8s:up`:

```bash
kubectl -n keidai get pods -l app=torii
kubectl -n keidai get svc torii -o jsonpath='{.spec.type} {.spec.sessionAffinity}{"\n"}'
```

Expect two Ready pods and `ClusterIP None`.

Then:

1. Start a Shaiden run that parks on a gated tool (`gmail.create_draft` for
   agent `shaiden-newsletter-01` in the demo config). Approve it from the UI
   while both Torii pods are Ready. The run should finish even if approve and
   `tasks/get` hit different pods (check each pod's logs for the request).
2. Park another gated run, delete **one** Torii pod, then approve. The
   remaining pod should still see the approval and MCP task; the run should
   finish. Deployment will recreate the deleted pod.

```bash
POD="$(kubectl -n keidai get pod -l app=torii -o jsonpath='{.items[0].metadata.name}')"
kubectl -n keidai delete pod "${POD}"
```

## Auth wiring

| Hop | Credential |
|-----|------------|
| Browser → BFF `/api/*` | Operator Google OIDC session cookie |
| Browser → BFF `/oauth/callback/*` | Proxied to Torii (provider redirect; no session) |
| Shaiden → Fuda `POST /token` | Projected SA JWT (`SHAIDEN_SUBJECT_TOKEN_FILE`) |
| Shaiden → Torii MCP | Fuda-minted agent JWT (`aud=torii`) |
| Torii → Fuda JWKS | HTTP to `http://fuda:3300/.well-known/jwks.json` |

Fuda mapping (validator-private, not in the database):

```text
FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS=keidai/shaiden=shaiden-runner
```

Fuda reconciles platform owners from ConfigMap `keidai-operators` at boot
(`FUDA_OPERATORS_PATH`). Create agents/bearers/grants via the management API
(or keidai-ui), not a seed YAML. Torii mounts the same ConfigMap
(`TORII_OPERATORS_PATH`) and wipes OAuth tokens / pending links for
`owner_id`s no longer in the registry. Restart Torii after editing operators
so the wipe runs; Fuda reconcile alone does not touch Torii's database.

## Secrets

| Key | Used by |
|-----|---------|
| `POSTGRES_PASSWORD` | Postgres superuser + app role password (URLs derived by `up.sh`) |
| `fuda-signing` / `dev.pem` | Fuda token signing |
| `OPEN_ROUTER_API_KEY` | Shaiden |
| `LINEAR_API_KEY`, `GITHUB_*`, `GOOGLE_*` | Torii demo backends (optional at boot) |
| `KEIDAI_GOOGLE_*`, `KEIDAI_SESSION_SECRET`, `keidai-operators` ConfigMap | BFF operator login |
| `BFF_SERVICE_TOKEN` | BFF → Torii/Fuda/Shaiden management API Bearer |

Operators are a Google ↔ opaque `owner_id` registry (`operators.yaml`). `up.sh`
loads ConfigMap `keidai-operators` from `KEIDAI_OPERATORS_FILE` (default:
[`deploy/operators.example.yaml`](../operators.example.yaml)). Fuda, Torii, and
the BFF all mount that file at boot.

## Notes

- [`base/torii.demo.yaml`](base/torii.demo.yaml) is a copy of `apps/torii/torii.demo.yaml`
  for kustomize (files must live under the kustomization directory). Keep them
  in sync when changing demo gateway config.
- Postgres is a single Deployment + PVC. Do not set `*_DB_PATH`.
- Torii is `replicas: 2` behind ClusterIP with no session affinity; other
  apps stay at 1.
- Do not set `TORII_UI_CLIENT_ROOT` — the UI is served by keidai-ui only.
- `TORII_GATEWAY_BASE_URL=http://localhost:3000` so backend OAuth initiate
  returns BFF-origin callbacks.
- Management APIs require `BFF_SERVICE_TOKEN` (set in `secrets.env`);
  keidai-ui injects it on proxied `/api/*` requests. Opt out only with
  `BFF_SERVICE_TOKEN_DISABLED=true`. `/api/health`, Torii `/mcp`, and Fuda
  `POST /token` stay on their existing auth models.
- OrbStack: if your kubectl context name does not contain `orbstack`, set
  `KEIDAI_ALLOW_ANY_CONTEXT=1`.

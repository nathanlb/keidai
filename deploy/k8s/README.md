# Keidai on Kubernetes (Helm)

Self-hosted deploy of Fuda, Torii, Shaiden, and **keidai-ui** (BFF + SPA) via
Helm. Only the BFF is published on the host (or Ingress). Backends are
ClusterIP-only. Shaiden authenticates to Fuda with a projected service-account
token (`aud=fuda`).

```text
Browser → keidai-ui:3000 (SPA, /auth/*, /api/*, /oauth/callback/*)
            ├─ Torii   :3100  (2 replicas, ClusterIP round-robin)
            ├─ Fuda    :3300
            └─ Shaiden :3200  ──SA JWT──▶ Fuda /token ──JWT──▶ Torii /mcp
```

## Layout

| Path | Role |
|------|------|
| [`chart/`](chart/) | Helm chart (`values.yaml` = k3s/production) |
| [`chart/values-kind.yaml`](chart/values-kind.yaml) | kind: `imagePullPolicy: Never`, BFF `hostPort` |
| [`chart/values-orbstack.yaml`](chart/values-orbstack.yaml) | OrbStack: BFF `LoadBalancer` |
| [`chart/values-secrets.example.yaml`](chart/values-secrets.example.yaml) | Shape of the uncommitted secrets values file |
| [`kind/kind-config.yaml`](kind/kind-config.yaml) | kind cluster (port map + SA issuer) |
| [`up.sh`](up.sh) / [`down.sh`](down.sh) | Local bring-up / teardown (`helm upgrade --install`) |
| [`install-k3s.md`](install-k3s.md) | Host install: OCI chart, no git clone, nginx Ingress |

## Prerequisites

- Docker (or OrbStack’s Docker) for kind/OrbStack profiles
- `kubectl`, `helm`, `openssl`
- **kind** profile: [kind](https://kind.sigs.k8s.io/)
- **orbstack** profile: [OrbStack](https://orbstack.dev/) with Kubernetes enabled
- **k3s:** follow **[Install on k3s](install-k3s.md)** (OCI chart, no git clone).
  `up.sh k3s` from a checkout is a fallback and still requires `KEIDAI_PUBLIC_URL`.
- Google OAuth client for **operator login** — register redirect URI
  `{publicUrl}/auth/callback` (for local profiles:
  `http://localhost:3000/auth/callback`). **This is the one install step the
  chart cannot do for you.**
- OpenRouter API key (Shaiden runs)

## Quick start (kind)

```bash
cp deploy/k8s/secrets.example.env deploy/k8s/secrets.env
# Fill KEIDAI_GOOGLE_*, KEIDAI_SESSION_SECRET (≥32 chars), OPEN_ROUTER_API_KEY,
# and BFF_SERVICE_TOKEN (`openssl rand -hex 32`).
# Operators default to deploy/operators.example.yaml (override with KEIDAI_OPERATORS_FILE).

pnpm k8s:up
# or: pnpm k8s:up:kind | pnpm k8s:up:orbstack | pnpm k8s:up:k3s
```

Open [http://localhost:3000](http://localhost:3000) and sign in via
`/auth/login`.

Tear down:

```bash
pnpm k8s:down          # or: pnpm k8s:down:orbstack / pnpm k8s:down:k3s
KEIDAI_DELETE_CLUSTER=1 pnpm k8s:down   # also delete the kind cluster
KEIDAI_DELETE_PVC=1 pnpm k8s:down       # also wipe postgres-data (kept by default)
```

## Image and chart distribution

Platform semver is unified across all workspace packages (`apps/*/package.json`,
`packages/*/package.json`) and [`Chart.yaml`](chart/Chart.yaml) `version` +
`appVersion`. Releases are maintainer-driven from GitHub Actions (**Prepare
release**): commit messages since the last `v*` tag are summarized via OpenRouter
into one **Release** PR (version bump + changelog). Merge that PR to create git
tag `v{semver}` and publish images **and** the Helm chart.

Artifacts are published to GHCR on version tags (`v*`) by
[`.github/workflows/publish-images.yml`](../../.github/workflows/publish-images.yml).
Chart `version`, `appVersion`, and every image tag are the same `{semver}`
(validated against the git tag). Production `image.tag` defaults to
`Chart.AppVersion`, so installing chart `0.2.0` pulls `keidai-*:0.2.0`. There is
no `:latest`.

| Artifact | Notes |
|----------|--------|
| `oci://ghcr.io/<owner>/keidai:<semver>` | Helm chart (OCI). Hosts install this; they do not need the git repo. |
| `ghcr.io/<owner>/keidai-fuda:<semver>` | Also tagged with the git SHA |
| `ghcr.io/<owner>/keidai-torii:<semver>` | |
| `ghcr.io/<owner>/keidai-shaiden:<semver>` | |
| `ghcr.io/<owner>/keidai-ui:<semver>` | Renamed from the old Compose artifact `keidai-keidai-ui` |

Remote k3s install (no git clone): **[install-k3s.md](install-k3s.md)**.

Chart and images on GHCR are public: no pull Secret and no `helm registry login`.
Set `imagePullSecrets` only if you override `image.registry` to a private mirror.

Local kind/OrbStack still uses this tree: `up.sh` builds `0.0.0-local`
(override with `KEIDAI_IMAGE_TAG`). k3s via `up.sh` uses `Chart.AppVersion`
unless `KEIDAI_IMAGE_TAG` is set.

Air-gapped fallback (not the default path): `docker save` / `k3s ctr images import`.

## Values axes

| Axis | Keys |
|------|------|
| Image sourcing | `image.registry`, `image.tag`, `image.pullPolicy`, `imagePullSecrets` |
| Service exposure | `keidaiUi.service.type`, `keidaiUi.hostPort`, `ingress.*` |
| Public URL | `publicUrl` (required, no default) → `TORII_GATEWAY_BASE_URL`, `KEIDAI_GOOGLE_REDIRECT_URI`, `KEIDAI_COOKIE_SECURE` (`true` iff `https://`) |

## Secrets

**Never** put passwords or signing keys in committed values. Templates refuse to
`genRSA` / invent `POSTGRES_PASSWORD` — a naive generator would rotate them on
every `helm upgrade` (invalidating tokens; locking out Postgres after init).

`up.sh` writes an uncommitted `deploy/k8s/secrets-values.yaml` from
`secrets.env` + the Fuda signing PEM + operators file, then runs:

```bash
helm upgrade --install keidai deploy/k8s/chart \
  -n keidai --create-namespace \
  -f deploy/k8s/chart/values-kind.yaml \
  -f deploy/k8s/secrets-values.yaml
```

On upgrade, empty secret values **lookup** the existing Secret so omitted keys
are not wiped. External secrets managers are out of scope for v1.

## Migrations and rollback

Schema migrations run in a Helm hook Job (`post-install`, `pre-upgrade`), not
as a silent boot side effect. Deployments set `KEIDAI_AUTO_MIGRATE=false` and
wait in an init container until `schema_migrations` exists, so first install
does not crash-loop ahead of the Job. `up.sh` does not pass `helm --wait`:
Helm would wait for those Deployments before running the post-install Job,
which never starts. Hook Jobs still block `helm` until they succeed;
`wait_ready` then waits for pods.

**`helm rollback` reverts manifests only — it does not undo schema.** Before
upgrading:

1. Back up the Postgres PVC / database.
2. Run `helm upgrade` (the pre-upgrade Job applies migrations with the new
   image tags before rolling pods).

Compose / local processes still auto-migrate at boot (`KEIDAI_AUTO_MIGRATE`
defaults to true when unset).

## Silent-failure guards

- App pod templates have `checksum/config` and `checksum/secret` annotations
  so ConfigMap/Secret changes restart pods (Postgres is not annotated — it
  does not consume those ConfigMaps).
- `postgres-data` has `helm.sh/resource-policy: keep` so `helm uninstall` does
  not delete customer data (`KEIDAI_DELETE_PVC=1` to wipe on teardown).

## OIDC issuer

Fuda discovers `FUDA_K8S_SA_OIDC_ISSUER` from
`https://kubernetes.default.svc/.well-known/openid-configuration` when the env
var is omitted (`KUBERNETES_SERVICE_HOST` is only the in-cluster probe). Set
`fuda.k8sSaOidc.issuer` if discovery cannot reach the apiserver.

## Torii connectors

Connectors are stored in Postgres and authored in keidai-ui Connections, with
their service keys and OAuth client secrets sealed under `TORII_SECRET_KEY`.
Fresh installs boot with zero backends, and the chart carries no backend
credentials — there is no connector config file to mount.

A connector can reference an environment variable instead of a sealed value.
Torii reads that variable from the torii pod at call time, so you have to add
it to the Deployment yourself; pasting the secret in keidai-ui is the path
that needs no manifest change.

## Persistence

One Postgres instance (`postgres:16-alpine`, ClusterIP `postgres:5432`) with
databases/roles `fuda`, `torii`, `shaiden`. Connection strings live in Secret
`keidai-secrets`. Apps fail closed if `*_DATABASE_URL` is missing.

Torii runs two replicas behind ClusterIP `service/torii`. Fuda, Shaiden,
keidai-ui, and Postgres stay at 1.

## Smoke

- Sign in at `/auth/login`. `/api/agents` and `/api/config` work same-origin.
- Fuda k8s SA OIDC (issuer discovered at boot):

  ```bash
  kubectl -n keidai exec deploy/fuda -- printenv FUDA_K8S_SA_OIDC_AUDIENCE
  ```

- Shaiden projected SA token:

  ```bash
  kubectl -n keidai exec deploy/shaiden -- head -c 20 /var/run/secrets/tokens/token
  ```

- Start a Shaiden run; token exchange + Torii MCP should succeed.
- Torii OAuth callbacks hit `{publicUrl}/oauth/callback/...`.

### Torii replicas

```bash
kubectl -n keidai get pods -l app=torii
kubectl -n keidai get svc torii -o jsonpath='{.spec.type} {.spec.sessionAffinity}{"\n"}'
```

Expect two Ready pods and `ClusterIP None`. Approvals and MCP tasks live in
shared Postgres, so approve and `tasks/get` may hit different pods.

Known leftovers: operator SSE is process-local across Torii replicas.

## Auth wiring

| Hop | Credential |
|-----|------------|
| Browser → BFF `/api/*` | Operator Google OIDC session cookie |
| Browser → BFF `/oauth/callback/*` | Proxied to Torii (provider redirect; no session) |
| Shaiden → Fuda `POST /token` | Projected SA JWT (`SHAIDEN_SUBJECT_TOKEN_FILE`) |
| Shaiden → Torii MCP | Fuda-minted agent JWT (`aud=torii`) |
| Torii → Fuda JWKS | HTTP to `http://fuda:3300/.well-known/jwks.json` |

Fuda allow-list (validator-private; bearer seeded as `shaiden-runner`):

```text
FUDA_K8S_SA_OIDC_SUBJECTS=<namespace>/shaiden
```

Operators ConfigMap `keidai-operators` is mounted into Fuda, Torii, and the BFF.

## Notes

- Management APIs require `BFF_SERVICE_TOKEN`; opt out only with
  `BFF_SERVICE_TOKEN_DISABLED=true`.
- OrbStack: if your kubectl context name does not contain `orbstack`, set
  `KEIDAI_ALLOW_ANY_CONTEXT=1`.
- k3s: follow [install-k3s.md](install-k3s.md). `up.sh k3s` from a checkout still
  works and requires `KEIDAI_PUBLIC_URL`. GHCR packages are public.

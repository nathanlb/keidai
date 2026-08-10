# Keidai on Kubernetes

Local deploy of Fuda, Torii, Shaiden, and **keidai-ui** (BFF + SPA).
Only the BFF is published on the host. Backends are ClusterIP-only. Shaiden
authenticates to Fuda with a projected service-account token (`aud=fuda`).

```text
Browser → keidai-ui:3000 (SPA, /auth/*, /api/*, /oauth/callback/*)
            ├─ Torii   :3100
            ├─ Fuda    :3300
            └─ Shaiden :3200  ──SA JWT──▶ Fuda /token ──JWT──▶ Torii /mcp
```

## Layout

| Path | Role |
|------|------|
| [`base/`](base/) | Portable manifests (Deployments, Services, PVCs, SA projection) |
| [`overlays/kind/`](overlays/kind/) | kind: `imagePullPolicy: Never`, BFF `hostPort`, cluster config |
| [`overlays/orbstack/`](overlays/orbstack/) | OrbStack: BFF `LoadBalancer`, hostPath SQLite → `apps/*/data` |

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
# Fill KEIDAI_GOOGLE_*, KEIDAI_SESSION_SECRET (≥32 chars), OPEN_ROUTER_API_KEY.
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

## OrbStack persistence

The orbstack overlay mounts SQLite via **hostPath** to the same dirs native
local runs use (visible inside OrbStack at the same absolute path):

```text
apps/fuda/data
apps/torii/data
apps/shaiden/data
```

`pnpm k8s:up:orbstack` ensures those dirs exist and generates
`overlays/orbstack/patch-hostpath-volumes.yaml` from the `.tmpl`. Data survives
disabling Kubernetes in OrbStack and is **not** removed by `k8s:down`. Delete
the `*.db` files under those dirs to reset.

Compose still uses named Docker volumes (`fuda-data`, etc.), so it does not
share these host files unless you change the compose binds.

Base / kind still use cluster `local-path` PVCs (wiped if the kind node is
deleted).

## What `k8s:up` does

1. Ensures the cluster for the overlay (creates kind, or checks OrbStack context).
2. `docker compose build` (kind then `kind load`; OrbStack reuses local images).
3. Creates Secrets `fuda-signing` and `keidai-secrets` from `secrets.env`.
4. `kubectl apply -k deploy/k8s/overlays/<overlay>`.
5. Patches `FUDA_K8S_SA_OIDC_ISSUER` from cluster OIDC discovery when available.
6. Waits for Deployments and prints a smoke checklist.

Apply without the helper script:

```bash
kubectl apply -k deploy/k8s/overlays/kind
# or
kubectl apply -k deploy/k8s/overlays/orbstack
```

(You still need the Secrets from `up.sh` or an equivalent.)

## Auth wiring

| Hop | Credential |
|-----|------------|
| Browser → BFF `/api/*` | Operator Google OIDC session cookie |
| Browser → BFF `/oauth/callback/*` | Proxied to Torii (provider redirect; no session) |
| Shaiden → Fuda `POST /token` | Projected SA JWT (`SHAIDEN_SUBJECT_TOKEN_FILE`) |
| Shaiden → Torii MCP | Fuda-minted agent JWT (`aud=torii`) |
| Torii → Fuda JWKS | HTTP to `http://fuda:3300/.well-known/jwks.json` |

Fuda mapping (validator-private, not in SQLite):

```text
FUDA_K8S_SA_OIDC_SUBJECT_MAPPINGS=keidai/shaiden=shaiden-runner
```

Fuda reconciles platform owners from ConfigMap `keidai-operators` at boot
(`FUDA_OPERATORS_PATH`). Create agents/bearers/grants via the management API
(or keidai-ui), not a seed YAML.

## Secrets

| Key | Used by |
|-----|---------|
| `fuda-signing` / `dev.pem` | Fuda token signing |
| `OPEN_ROUTER_API_KEY` | Shaiden |
| `LINEAR_API_KEY`, `GITHUB_*`, `GOOGLE_*` | Torii demo backends (optional at boot) |
| `KEIDAI_GOOGLE_*`, `KEIDAI_SESSION_SECRET`, `keidai-operators` ConfigMap | BFF operator login |
| `BFF_SERVICE_TOKEN` | BFF → Torii/Fuda/Shaiden management API Bearer |

Operators are a Google ↔ opaque `owner_id` registry (`operators.yaml`). `up.sh`
loads ConfigMap `keidai-operators` from `KEIDAI_OPERATORS_FILE` (default:
[`deploy/operators.example.yaml`](../operators.example.yaml)). Fuda and the BFF
both mount that file at boot.

## Notes

- [`base/torii.demo.yaml`](base/torii.demo.yaml) is a copy of `apps/torii/torii.demo.yaml`
  for kustomize (files must live under the kustomization directory). Keep them
  in sync when changing demo gateway config.
- SQLite PVCs imply **replicas=1** for Fuda, Torii, and Shaiden.
- Do not set `TORII_UI_CLIENT_ROOT` — the UI is served by keidai-ui only.
- `TORII_GATEWAY_BASE_URL=http://localhost:3000` so backend OAuth initiate
  returns BFF-origin callbacks.
- Management APIs require `BFF_SERVICE_TOKEN` (set in `secrets.env`);
  keidai-ui injects it on proxied `/api/*` requests. Opt out only with
  `BFF_SERVICE_TOKEN_DISABLED=true`. `/api/health`, Torii `/mcp`, and Fuda
  `POST /token` stay on their existing auth models.
- OrbStack: if your kubectl context name does not contain `orbstack`, set
  `KEIDAI_ALLOW_ANY_CONTEXT=1`.

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
| [`base/`](base/) | Portable manifests (Deployments, Services, PVCs, SA projection, seed init) |
| [`overlays/kind/`](overlays/kind/) | kind: `imagePullPolicy: Never`, BFF `hostPort`, cluster config |
| [`overlays/orbstack/`](overlays/orbstack/) | OrbStack: BFF `LoadBalancer`, shared local Docker images |

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
# Fill KEIDAI_GOOGLE_*, KEIDAI_SESSION_SECRET (≥32 chars),
# KEIDAI_OPERATOR_GOOGLE_EMAILS (or _SUBS), OPEN_ROUTER_API_KEY.

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

Seed ([`apps/fuda/fuda.seed.k8s.example.yaml`](../../apps/fuda/fuda.seed.k8s.example.yaml))
runs as a Fuda **init container** against the shared PVC (`bearer_id:
shaiden-runner` + demo agent grants).

## Secrets

| Key | Used by |
|-----|---------|
| `fuda-signing` / `dev.pem` | Fuda token signing |
| `OPEN_ROUTER_API_KEY` | Shaiden |
| `LINEAR_API_KEY`, `GITHUB_*`, `GOOGLE_*` | Torii demo backends (optional at boot) |
| `KEIDAI_GOOGLE_*`, `KEIDAI_SESSION_SECRET`, allowlists, `KEIDAI_OWNER_ID` | BFF operator login |

`KEIDAI_OWNER_ID` should match Torii `boot_owner_id` / Fuda seed `owner_id`
(`demo-owner` in the bundled configs).

## Notes

- [`base/torii.demo.yaml`](base/torii.demo.yaml) is a copy of `apps/torii/torii.demo.yaml`
  for kustomize (files must live under the kustomization directory). Keep them
  in sync when changing demo gateway config.
- SQLite PVCs imply **replicas=1** for Fuda, Torii, and Shaiden.
- Do not set `TORII_UI_CLIENT_ROOT` — the UI is served by keidai-ui only.
- `TORII_GATEWAY_BASE_URL=http://localhost:3000` so backend OAuth initiate
  returns BFF-origin callbacks.
- Management APIs on Fuda remain unauthenticated at the service; reach them
  only via the BFF session gate.
- OrbStack: if your kubectl context name does not contain `orbstack`, set
  `KEIDAI_ALLOW_ANY_CONTEXT=1`.

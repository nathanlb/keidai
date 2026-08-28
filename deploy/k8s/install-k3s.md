# Install Keidai on k3s

This is the path for a machine that already runs k3s. You do **not** clone this
repository. Pull the Helm chart and images from GHCR at the same `{semver}`.

Only **keidai-ui** is the operator edge. Fuda, Torii, Shaiden, and Postgres stay
ClusterIP.

```text
Browser → nginx Ingress :80/:443 → keidai-ui:3000
                                      ├─ torii:3100
                                      ├─ fuda:3300
                                      └─ shaiden:3200 ──SA JWT──▶ Fuda /token
```

Every command below reads `HOST`, `PUBLIC_URL`, and `VERSION` from the shell
you export them in (§0). Nothing in this guide hard-codes a hostname — set
yours once and paste the rest verbatim. Chart version, `appVersion`, and image
tags are the same semver: chart `0.2.0` pulls `ghcr.io/nathanlb/keidai-*:0.2.0`.
There is no `:latest`.

The one step Helm cannot do: register `{publicUrl}/auth/callback` on the
operator Google OAuth client.

## Prerequisites

On the node:

- k3s running (`kubectl get nodes`)
- [Helm](https://helm.sh/docs/intro/install/) 3.8+ (OCI charts)
- `openssl`
- One hostname that every operator's browser resolves to this node. Public DNS,
  split-horizon DNS, a private overlay network's name service, or `/etc/hosts`
  on each client all work — the chart only cares that the name is stable and
  matches the origin you register with Google.
- Google OAuth client (operator login) and an OpenRouter API key (Shaiden)

The Helm chart (`oci://ghcr.io/nathanlb/keidai`) and app images
(`ghcr.io/nathanlb/keidai-*`) are **public**. You do not need a GitHub PAT,
`helm registry login`, or an `imagePullSecrets` entry.

Do not use `up.sh` here. That script exists for kind/OrbStack from a git
checkout.

## 0. Shell variables

Set these in the shell you run the whole install from. Re-export them in any
new shell before re-running a command.

```bash
export VERSION=0.2.0
export CHART=oci://ghcr.io/nathanlb/keidai
export HOST=<the hostname browsers will use>   # e.g. keidai.internal.example
export PUBLIC_URL="http://${HOST}"             # becomes https:// in §6
```

`publicUrl` has no chart default. Omit it and install fails closed. Use
`https://` only once TLS actually terminates for that origin — cookies are
`Secure` iff the origin is `https://`, so an `https://` origin served over
plain HTTP silently drops the operator session. This guide therefore brings the
host up on `http://` and switches in §6, which costs one `helm upgrade` and one
Google redirect-URI edit. If TLS is already terminating for `HOST`, set
`https://` now and skip §6.

## 1. kubectl for your user

k3s writes a root-only kubeconfig.

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown "$(id -u):$(id -g)" ~/.kube/config
kubectl get nodes
```

Install Helm if needed:

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

Confirm the published chart is reachable (anonymous):

```bash
helm show chart "${CHART}" --version "${VERSION}"
```

## 2. Secrets, operators, signing key

Create a directory you will keep (not world-readable):

```bash
mkdir -p ~/keidai && chmod 700 ~/keidai && cd ~/keidai
```

Generate the Fuda RSA key and two long random values. **Keep the PEM.** Rotating
it invalidates agent JWTs.

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out fuda.pem
chmod 600 fuda.pem
openssl rand -hex 32   # paste as keidaiSessionSecret (≥32 chars)
openssl rand -hex 32   # paste as bffServiceToken
```

`secrets-values.yaml` (mode `600`). `operators` is the Google identity → opaque
`owner_id` allowlist (same file Fuda, Torii, and the BFF consume):

```yaml
operators: |
  operators:
    - owner_id: nathan-lafranceb
      google_email: you@example.com

secrets:
  postgresPassword: "..."
  openRouterApiKey: "..."
  keidaiGoogleClientId: "....apps.googleusercontent.com"
  keidaiGoogleClientSecret: "..."
  keidaiSessionSecret: "..."
  bffServiceToken: "..."
  bffServiceTokenDisabled: ""
```

Leave `fudaSigningKey` out of this file and pass the PEM with `--set-file` at
install time so you never paste a private key into YAML.

Shape reference (from a machine that can pull the chart):

```bash
helm show values "${CHART}" --version "${VERSION}"
```

Do not set `bffServiceTokenDisabled` on a real host.

## 3. Host values (`publicUrl` + Ingress)

Write `values.yaml` in `~/keidai` from the variables so the origin and the
Ingress host cannot drift apart:

```bash
cat > ~/keidai/values.yaml <<EOF
publicUrl: ${PUBLIC_URL}

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: ${HOST}
      paths:
        - path: /
          pathType: Prefix
  tls: []
EOF
cat ~/keidai/values.yaml
```

`publicUrl` and `ingress.hosts[].host` must both be the name browsers use.
Register this Google redirect **before** you expect login to work:

```text
{publicUrl}/auth/callback
```

`tls: []` means nginx serves this host over HTTP only. Keep `PUBLIC_URL` on
`http://` until §6 attaches a certificate, or login drops the session cookie.

## 4. nginx Ingress

k3s ships Traefik on :80/:443. Run **one** controller. This guide uses
ingress-nginx in front of Service `keidai-ui` only.

### Disable Traefik

```bash
sudo mkdir -p /etc/rancher/k3s
printf 'disable:\n  - traefik\n' | sudo tee /etc/rancher/k3s/config.yaml
sudo systemctl restart k3s
```

Wait until the API is back (`kubectl get nodes`), then confirm Traefik is gone
and no IngressClass is required yet.

### Install ingress-nginx

k3s ServiceLB (Klipper) binds a LoadBalancer Service to this node’s IP — the
same pattern Traefik used:

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.ingressClassResource.name=nginx \
  --set controller.ingressClassResource.enabled=true \
  --set controller.ingressClassByName=true \
  --set controller.service.type=LoadBalancer
```

```bash
kubectl -n ingress-nginx rollout status deploy/ingress-nginx-controller
kubectl -n ingress-nginx get svc ingress-nginx-controller
```

`EXTERNAL-IP` is whichever node address Klipper bound — usually the LAN IP. It
is a "the Service found an address" check, not necessarily the address your
clients use. Klipper’s ServiceLB pods bind host ports 80/443 on `0.0.0.0`, so
any address that reaches this node reaches nginx: the LAN IP, a public IP, or
an overlay/VPN address. If 80/443 are already taken, free them before this
Service can bind.

What matters is that `HOST` resolves, **from a client machine**, to one of
those addresses:

```bash
dig +short "$HOST"       # or: getent hosts "$HOST"
curl -sI "http://${HOST}/"   # nginx 404 is the expected answer — nothing is installed yet
```

If it does not resolve yet, create the record wherever that name is served —
an A/AAAA record in your DNS zone, an `/etc/hosts` line on each client, or
whatever your overlay network uses. Overlay networks often publish the name
for you; see [Appendix: private overlay networks](#appendix-private-overlay-networks).

## 5. Install the chart

Do **not** pass `helm --wait`. Helm would wait for Deployments before the
post-install migrate Job; app pods wait for that Job — deadlock. Hook Jobs still
block `helm` until they succeed.

From `~/keidai`:

```bash
helm upgrade --install keidai "${CHART}" --version "${VERSION}" \
  --namespace keidai --create-namespace \
  -f secrets-values.yaml \
  -f values.yaml \
  --set-file secrets.fudaSigningKey=./fuda.pem \
  --timeout 10m
```

Then wait for workloads:

```bash
kubectl -n keidai rollout status deployment/postgres --timeout=180s
kubectl -n keidai rollout status deployment/fuda --timeout=180s
kubectl -n keidai rollout status deployment/torii --timeout=180s
kubectl -n keidai rollout status deployment/shaiden --timeout=180s
kubectl -n keidai rollout status deployment/keidai-ui --timeout=180s
kubectl -n keidai get pods,svc,ingress
```

Expect postgres, fuda, shaiden, keidai-ui at 1 replica, torii at 2, Ingress
`keidai-ui`.

Open `{publicUrl}/auth/login`.

## 6. TLS

Serving `http://` with `ingress.tls: []` is expected — nginx presents no
trusted certificate until a TLS Secret is attached to the Ingress. Pick
whichever issuer fits how `HOST` is published.

### Option A — cert-manager + Let's Encrypt

Requires `HOST` to resolve publicly and answer on port 80 from the internet
(HTTP-01), or a DNS-01 solver for your provider. Install cert-manager and a
`ClusterIssuer`, then add `cert-manager.io/cluster-issuer: letsencrypt-prod`
to the `ingress.annotations` block below. cert-manager issues into the Secret
named by `ingress.tls[].secretName` — you create nothing by hand.

### Option B — bring your own certificate

Any certificate valid for `HOST` — internal CA, commercial CA, or one minted
by your overlay network (see the appendix). Load it into the Ingress
namespace:

```bash
kubectl -n keidai create secret tls keidai-ui-tls \
  --cert=/path/to/fullchain.crt \
  --key=/path/to/private.key \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Attach it and switch the origin

```bash
export PUBLIC_URL="https://${HOST}"

cat > ~/keidai/values.yaml <<EOF
publicUrl: ${PUBLIC_URL}

ingress:
  enabled: true
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
  hosts:
    - host: ${HOST}
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: keidai-ui-tls
      hosts:
        - ${HOST}
EOF
```

Re-run the same `helm upgrade` as in §5 (still pass secrets and `--set-file`
for the Fuda key), then verify:

```bash
kubectl -n keidai get ingress keidai-ui   # PORTS should include 80, 443
curl -sI "https://${HOST}/"
```

Register `{publicUrl}/auth/callback` with the `https://` origin — the `http://`
one stops working once `force-ssl-redirect` is on.

Rotating the certificate later is a Secret update, not a `helm upgrade`:
ingress-nginx reloads when the Secret changes.

## Smoke

- Sign in at `{publicUrl}/auth/login`. `/api/agents` and `/api/config` are
  same-origin through the BFF.
- `kubectl -n keidai exec deploy/fuda -- printenv FUDA_K8S_SA_OIDC_AUDIENCE`
  → `fuda` (issuer is discovered from the apiserver at boot).
- `kubectl -n keidai exec deploy/shaiden -- head -c 20 /var/run/secrets/tokens/token`
- A fresh install has no connectors, no agents, and no group policy. Work
  through [first-run prerequisites](../../docs/reference.md#first-run-prerequisites)
  before expecting a run to have any tools.
- Start a Shaiden run; Fuda token exchange and Torii MCP should succeed.
- Backend OAuth callbacks hit `{publicUrl}/oauth/callback/...` (still the BFF,
  not Torii).

```bash
kubectl -n keidai get pods -l app=torii
# two Ready pods; ClusterIP round-robin. Approvals live in shared Postgres.
```

## Upgrades

Back up the Postgres PVC **before** upgrading. `helm rollback` reverts manifests
only — it does not undo schema. The pre-upgrade Job applies migrations with the
new image tags before pods roll.

Bump `VERSION` and re-run the same `helm upgrade` line, always passing
`-f secrets-values.yaml`, `-f values.yaml`, and `--set-file secrets.fudaSigningKey`.
Empty secret keys in the chart look up the existing Secret, but omitting the
files is how values get wiped.

## Uninstall

```bash
helm uninstall keidai -n keidai
```

The `postgres-data` PVC is kept (`helm.sh/resource-policy: keep`). Wipe it only
if you intend to destroy the databases:

```bash
kubectl -n keidai delete pvc postgres-data
kubectl delete namespace keidai
```

ingress-nginx is separate:

```bash
helm uninstall ingress-nginx -n ingress-nginx
```

## Notes that bite on a home k3s box

- Do not NodePort or Ingress Fuda, Torii, or Shaiden.
- `ImagePullBackOff` → wrong `{semver}` / tag, or the node cannot reach GHCR.
  Do not add `ghcr-pull`; packages are public.
- Install error mentioning `publicUrl` → it was omitted; the chart refuses a
  placeholder origin.
- Ingress error mentioning `ingress.hosts` → `ingress.enabled` is true but no
  hosts were set.
- Login loop with `https://` publicUrl → TLS is not actually serving that
  origin, so the `Secure` cookie is dropped.
- Management APIs need `bffServiceToken`; do not disable it on this host.

## Appendix: private overlay networks

Nothing in Keidai depends on an overlay network. This is one worked example for
readers who do not want to publish `HOST` on the public internet. Tailscale is
used here because MagicDNS solves both problems §4 and §6 pose — a name that
resolves for clients, and a certificate for it — but WireGuard, ZeroTier, or a
split-horizon resolver plus an internal CA fit the same two slots.

**Name (§4).** MagicDNS already maps the node's `<machine>.<tailnet>.ts.net` to
its Tailscale IP for every device on the tailnet, so there is no record to
create. Use that name (or another one you created in the tailnet) as `HOST`.
Confirm what it is, and that clients agree:

```bash
tailscale status --json | jq -r '.Self.DNSName | rtrimstr(".")'   # on the node (needs jq)
dig +short "$HOST"                                                # from a client: expect 100.x
```

If those two disagree, fix `HOST` before installing — the Ingress host,
`publicUrl`, and the certificate all have to be the same name.

**Certificate (§6, option B).** Enable **HTTPS Certificates** in the Tailscale
admin console (DNS settings), then issue one on the node. Public Let's Encrypt
is not an option for a `ts.net` name, since it never answers on port 80 from
the internet.

```bash
sudo tailscale cert \
  --cert-file "${HOME}/keidai/${HOST}.crt" \
  --key-file "${HOME}/keidai/${HOST}.key" \
  "${HOST}"
sudo chown "$(id -u):$(id -g)" "${HOME}/keidai/${HOST}.crt" "${HOME}/keidai/${HOST}.key"
chmod 600 "${HOME}/keidai/${HOST}.key"
```

Feed those two files to the `kubectl create secret tls` in §6.

**Renewal.** These certificates are short-lived, so script the refresh rather
than remembering to do it. Save this as `~/keidai/refresh-cert.sh` and run it
daily (cron, or a systemd timer). It sets its own `HOST` and paths — a timer
inherits none of your interactive shell's variables — and re-applies ownership,
because `tailscale cert` writes as root:

```bash
#!/usr/bin/env bash
set -euo pipefail

HOST=keidai.your-tailnet.ts.net          # same name as publicUrl
DIR=/home/youruser/keidai
KUBECONFIG=/home/youruser/.kube/config
export KUBECONFIG

sudo tailscale cert --cert-file "${DIR}/${HOST}.crt" --key-file "${DIR}/${HOST}.key" "${HOST}"
sudo chown "$(id -u):$(id -g)" "${DIR}/${HOST}.crt" "${DIR}/${HOST}.key"
chmod 600 "${DIR}/${HOST}.key"

kubectl -n keidai create secret tls keidai-ui-tls \
  --cert="${DIR}/${HOST}.crt" --key="${DIR}/${HOST}.key" \
  --dry-run=client -o yaml | kubectl apply -f -
```

Unattended `sudo` needs a NOPASSWD sudoers entry for `tailscale cert`;
otherwise run the timer as root and `chown` to whoever owns the kubeconfig.
ingress-nginx picks up the new Secret on its own; no `helm upgrade`.

`tailscale serve` is the other shape — TLS terminates in Tailscale and nginx
stays HTTP. It keeps `publicUrl` on `https://` too, but the Ingress no longer
sees TLS, so this guide uses the certificate-on-Ingress path instead.

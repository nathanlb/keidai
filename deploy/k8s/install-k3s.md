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

Replace `keidai.example.com` and `0.2.0` with your hostname and the release you
are installing. Chart version, `appVersion`, and image tags are the same
semver: chart `0.2.0` pulls `ghcr.io/nathanlb/keidai-*:0.2.0`. There is no
`:latest`.

The one step Helm cannot do: register `{publicUrl}/auth/callback` on the
operator Google OAuth client.

## Prerequisites

On the node:

- k3s running (`kubectl get nodes`)
- [Helm](https://helm.sh/docs/intro/install/) 3.8+ (OCI charts)
- `openssl`
- A DNS name (or `/etc/hosts` on clients) pointing at this node
- A GitHub PAT with `read:packages` if GHCR packages are private
- Google OAuth client (operator login) and an OpenRouter API key (Shaiden)

Do not use `up.sh` here. That script exists for kind/OrbStack from a git
checkout.

```bash
export VERSION=0.2.0
export CHART=oci://ghcr.io/nathanlb/keidai
export PUBLIC_URL=https://keidai.example.com   # must match DNS + OAuth
export HOST=keidai.example.com
```

`publicUrl` has no chart default. Omit it and install fails closed. Use
`https://` only if TLS will actually terminate on this Ingress (cookies are
`Secure` iff the origin is `https://`). For a LAN HTTP first bring-up, set
`PUBLIC_URL=http://keidai.example.com`.

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

## 2. GHCR pull Secret

Production values expect a Secret named `ghcr-pull` in namespace `keidai`.

```bash
kubectl create namespace keidai

kubectl -n keidai create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GHCR_PAT
```

If the Helm chart package is also private:

```bash
echo "$GHCR_PAT" | helm registry login ghcr.io \
  -u YOUR_GITHUB_USERNAME --password-stdin
```

Confirm the chart exists:

```bash
helm show chart "${CHART}" --version "${VERSION}"
```

## 3. Secrets, operators, signing key

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
  linearApiKey: ""
  githubClientId: ""
  githubClientSecret: ""
  googleClientId: ""
  googleClientSecret: ""
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

## 4. Host values (`publicUrl` + Ingress)

`values.yaml` in `~/keidai`:

```yaml
publicUrl: https://keidai.example.com

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: keidai.example.com
      paths:
        - path: /
          pathType: Prefix
  tls: []
```

`publicUrl` and `ingress.hosts[].host` must be the name browsers use. Register
this Google redirect **before** you expect login to work:

```text
{publicUrl}/auth/callback
```

If you enable TLS later, put `tls` here and keep `publicUrl` on `https://`. Until
certificates work, either use `http://` in `publicUrl` or login will drop the
session cookie.

## 5. nginx Ingress

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

`EXTERNAL-IP` should be this node. Point DNS `HOST` at that address. If 80/443
are already taken, free them before this Service can bind.

## 6. Install the chart

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

## 7. TLS (optional)

If `publicUrl` is `https://`, terminate TLS on this Ingress.

**cert-manager + Let’s Encrypt** (hostname must answer on port 80 from the
internet):

```yaml
# add to ~/keidai/values.yaml under ingress:
annotations:
  cert-manager.io/cluster-issuer: letsencrypt-prod
tls:
  - secretName: keidai-ui-tls
    hosts:
      - keidai.example.com
```

Re-run the same `helm upgrade` command. Or create a TLS Secret yourself
(`tls.crt` / `tls.key`) and set `ingress.tls` the same way.

## Smoke

- Sign in at `{publicUrl}/auth/login`. `/api/agents` and `/api/config` are
  same-origin through the BFF.
- `kubectl -n keidai exec deploy/fuda -- printenv FUDA_K8S_SA_OIDC_AUDIENCE`
  → `fuda` (issuer is discovered from the apiserver at boot).
- `kubectl -n keidai exec deploy/shaiden -- head -c 20 /var/run/secrets/tokens/token`
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
- `ImagePullBackOff` → `ghcr-pull` missing, wrong PAT, or package visibility.
- Install error mentioning `publicUrl` → it was omitted; the chart refuses a
  placeholder origin.
- Ingress error mentioning `ingress.hosts` → `ingress.enabled` is true but no
  hosts were set.
- Login loop with `https://` publicUrl → TLS is not actually serving that
  origin, so the `Secure` cookie is dropped.
- Management APIs need `bffServiceToken`; do not disable it on this host.

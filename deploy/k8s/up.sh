#!/usr/bin/env bash
# Bring up the Keidai stack on a local Kubernetes cluster.
# Usage: up.sh [kind|orbstack]   (default: kind)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
K8S_DIR="${ROOT}/deploy/k8s"
OVERLAY="${1:-${KEIDAI_K8S_OVERLAY:-kind}}"
OVERLAY_DIR="${K8S_DIR}/overlays/${OVERLAY}"
CLUSTER_NAME="${KEIDAI_KIND_CLUSTER:-keidai}"
NAMESPACE=keidai
SECRETS_ENV="${KEIDAI_SECRETS_ENV:-${K8S_DIR}/secrets.env}"
PUBLIC_URL="${KEIDAI_PUBLIC_URL:-http://localhost:3000}"

IMAGES=(
  keidai-fuda:latest
  keidai-torii:latest
  keidai-shaiden:latest
  keidai-keidai-ui:latest
)

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

ensure_overlay() {
  [[ -d "${OVERLAY_DIR}" ]] || die "unknown overlay '${OVERLAY}' (expected kind or orbstack)"
}

ensure_kind_cluster() {
  if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
    log "kind cluster '${CLUSTER_NAME}' already exists"
    return
  fi
  log "creating kind cluster '${CLUSTER_NAME}'"
  kind create cluster --name "${CLUSTER_NAME}" --config "${OVERLAY_DIR}/kind-config.yaml"
}

ensure_orbstack_cluster() {
  if ! kubectl cluster-info >/dev/null 2>&1; then
    die "kubectl cannot reach a cluster — enable Kubernetes in OrbStack and select its kubeconfig"
  fi
  local ctx
  ctx="$(kubectl config current-context 2>/dev/null || true)"
  log "using kubectl context: ${ctx:-unknown}"
  if [[ "${ctx}" != *orbstack* && "${KEIDAI_ALLOW_ANY_CONTEXT:-0}" != "1" ]]; then
    die "current context '${ctx}' does not look like OrbStack (set KEIDAI_ALLOW_ANY_CONTEXT=1 to override)"
  fi
}

# Materialize hostPath patches onto apps/*/data (same dirs as native local runs).
# Mac home paths are visible inside OrbStack at the same absolute path.
prepare_orbstack_hostpath() {
  local fuda_data="${ROOT}/apps/fuda/data"
  local torii_data="${ROOT}/apps/torii/data"
  local shaiden_data="${ROOT}/apps/shaiden/data"
  local tmpl="${OVERLAY_DIR}/patch-hostpath-volumes.yaml.tmpl"
  local out="${OVERLAY_DIR}/patch-hostpath-volumes.yaml"

  [[ -f "${tmpl}" ]] || die "missing ${tmpl}"

  log "preparing hostPath data dirs (apps/{fuda,torii,shaiden}/data)"
  mkdir -p "${fuda_data}" "${torii_data}" "${shaiden_data}"
  # Pods run as uid 1001; keep local dirs writable across Mac↔VM ownership.
  chmod 777 "${fuda_data}" "${torii_data}" "${shaiden_data}"

  local esc_fuda esc_torii esc_shaiden
  esc_fuda="$(printf '%s' "${fuda_data}" | sed -e 's/[&\\]/\\&/g')"
  esc_torii="$(printf '%s' "${torii_data}" | sed -e 's/[&\\]/\\&/g')"
  esc_shaiden="$(printf '%s' "${shaiden_data}" | sed -e 's/[&\\]/\\&/g')"
  sed \
    -e "s|__KEIDAI_FUDA_DATA__|${esc_fuda}|g" \
    -e "s|__KEIDAI_TORII_DATA__|${esc_torii}|g" \
    -e "s|__KEIDAI_SHAIDEN_DATA__|${esc_shaiden}|g" \
    "${tmpl}" >"${out}"
  log "wrote ${out}"
}

build_images() {
  log "building images (docker compose)"
  (
    cd "${ROOT}"
    docker compose build
  )
}

load_images_kind() {
  log "loading images into kind"
  for image in "${IMAGES[@]}"; do
    kind load docker-image "${image}" --name "${CLUSTER_NAME}"
  done
}

resolve_signing_key() {
  local key_file="${FUDA_SIGNING_KEY_FILE:-}"
  if [[ -z "${key_file}" && -f "${SECRETS_ENV}" ]]; then
    key_file="$(grep -E '^FUDA_SIGNING_KEY_FILE=' "${SECRETS_ENV}" | head -1 | cut -d= -f2- || true)"
  fi
  if [[ -z "${key_file}" ]]; then
    key_file="${ROOT}/apps/fuda/keys/dev.pem"
  elif [[ "${key_file}" != /* ]]; then
    key_file="${K8S_DIR}/${key_file}"
  fi

  if [[ ! -f "${key_file}" ]]; then
    log "generating Fuda signing key at ${key_file}"
    mkdir -p "$(dirname "${key_file}")"
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "${key_file}"
    chmod 600 "${key_file}"
  fi
  printf '%s' "${key_file}"
}

load_secrets_env() {
  [[ -f "${SECRETS_ENV}" ]] || die "missing ${SECRETS_ENV} — copy secrets.example.env and fill in operator OIDC + OPEN_ROUTER_API_KEY"

  # shellcheck disable=SC1090
  set -a
  # shellcheck disable=SC1090
  source "${SECRETS_ENV}"
  set +a

  local required=(
    KEIDAI_GOOGLE_CLIENT_ID
    KEIDAI_GOOGLE_CLIENT_SECRET
    KEIDAI_SESSION_SECRET
    OPEN_ROUTER_API_KEY
  )
  for name in "${required[@]}"; do
    [[ -n "${!name:-}" ]] || die "set ${name} in ${SECRETS_ENV}"
  done
  local disabled
  disabled="$(printf '%s' "${BFF_SERVICE_TOKEN_DISABLED:-}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${disabled}" != "true" && "${disabled}" != "1" && "${disabled}" != "yes" ]]; then
    [[ -n "${BFF_SERVICE_TOKEN:-}" ]] || die "set BFF_SERVICE_TOKEN in ${SECRETS_ENV} (or BFF_SERVICE_TOKEN_DISABLED=true)"
  fi
  if [[ -z "${KEIDAI_OPERATORS_FILE:-}" ]]; then
    KEIDAI_OPERATORS_FILE="${ROOT}/deploy/operators.example.yaml"
  elif [[ "${KEIDAI_OPERATORS_FILE}" != /* ]]; then
    # Relative paths in secrets.env are from deploy/k8s/ (same as FUDA_SIGNING_KEY_FILE).
    KEIDAI_OPERATORS_FILE="${K8S_DIR}/${KEIDAI_OPERATORS_FILE}"
  fi
  if [[ ! -f "${KEIDAI_OPERATORS_FILE}" ]]; then
    die "operators file not found: ${KEIDAI_OPERATORS_FILE} (set KEIDAI_OPERATORS_FILE in ${SECRETS_ENV})"
  fi
  if [[ "${#KEIDAI_SESSION_SECRET}" -lt 32 ]]; then
    die "KEIDAI_SESSION_SECRET must be at least 32 characters"
  fi
}

create_secrets() {
  load_secrets_env
  local key_file
  key_file="$(resolve_signing_key)"

  log "ensuring namespace ${NAMESPACE}"
  kubectl apply -f "${K8S_DIR}/base/namespace.yaml"

  log "creating/updating Secret fuda-signing"
  kubectl -n "${NAMESPACE}" create secret generic fuda-signing \
    --from-file="dev.pem=${key_file}" \
    --dry-run=client -o yaml | kubectl apply -f -

  log "creating/updating ConfigMap keidai-operators from ${KEIDAI_OPERATORS_FILE}"
  kubectl -n "${NAMESPACE}" create configmap keidai-operators \
    --from-file="operators.yaml=${KEIDAI_OPERATORS_FILE}" \
    --dry-run=client -o yaml | kubectl apply -f -

  log "creating/updating Secret keidai-secrets"
  kubectl -n "${NAMESPACE}" create secret generic keidai-secrets \
    --from-literal="OPEN_ROUTER_API_KEY=${OPEN_ROUTER_API_KEY}" \
    --from-literal="LINEAR_API_KEY=${LINEAR_API_KEY:-}" \
    --from-literal="GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID:-}" \
    --from-literal="GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET:-}" \
    --from-literal="GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}" \
    --from-literal="GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}" \
    --from-literal="KEIDAI_GOOGLE_CLIENT_ID=${KEIDAI_GOOGLE_CLIENT_ID}" \
    --from-literal="KEIDAI_GOOGLE_CLIENT_SECRET=${KEIDAI_GOOGLE_CLIENT_SECRET}" \
    --from-literal="KEIDAI_SESSION_SECRET=${KEIDAI_SESSION_SECRET}" \
    --from-literal="BFF_SERVICE_TOKEN=${BFF_SERVICE_TOKEN:-}" \
    --from-literal="BFF_SERVICE_TOKEN_DISABLED=${BFF_SERVICE_TOKEN_DISABLED:-}" \
    --dry-run=client -o yaml | kubectl apply -f -
}

refresh_oidc_issuer() {
  log "refreshing Fuda k8s SA OIDC issuer from cluster discovery"
  local discovery issuer current
  if ! discovery="$(kubectl get --raw /.well-known/openid-configuration 2>/dev/null)"; then
    log "OIDC discovery unavailable; keeping ConfigMap defaults"
    return
  fi
  issuer="$(printf '%s' "${discovery}" | sed -n 's/.*"issuer"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  if [[ -z "${issuer}" ]]; then
    log "could not parse issuer; keeping ConfigMap defaults"
    return
  fi

  current="$(
    kubectl -n "${NAMESPACE}" get configmap fuda-config \
      -o jsonpath='{.data.FUDA_K8S_SA_OIDC_ISSUER}' 2>/dev/null || true
  )"
  if [[ "${current}" == "${issuer}" ]]; then
    log "FUDA_K8S_SA_OIDC_ISSUER already ${issuer}"
    return
  fi

  kubectl -n "${NAMESPACE}" patch configmap fuda-config --type merge \
    -p "{\"data\":{\"FUDA_K8S_SA_OIDC_ISSUER\":\"${issuer}\"}}"
  log "FUDA_K8S_SA_OIDC_ISSUER=${issuer} (was ${current:-unset}); restarting Fuda to pick up env"
  # ConfigMap env is fixed at pod start — restart so validation uses the real issuer.
  kubectl -n "${NAMESPACE}" rollout restart deployment/fuda
}

apply_manifests() {
  create_secrets
  log "applying overlay: ${OVERLAY}"
  kubectl apply -k "${OVERLAY_DIR}"
  refresh_oidc_issuer
}

wait_ready() {
  log "waiting for Deployments"
  kubectl -n "${NAMESPACE}" rollout status deployment/fuda --timeout=180s
  kubectl -n "${NAMESPACE}" rollout status deployment/torii --timeout=180s
  kubectl -n "${NAMESPACE}" rollout status deployment/shaiden --timeout=180s
  kubectl -n "${NAMESPACE}" rollout status deployment/keidai-ui --timeout=180s
}

print_checklist() {
  local data_note=""
  if [[ "${OVERLAY}" == "orbstack" ]]; then
    data_note="
  SQLite hostPath: apps/{fuda,torii,shaiden}/data (shared with native local runs)
  (survives OrbStack Kubernetes disable; not deleted by k8s:down)
"
  fi
  cat <<EOF

Keidai is up (overlay: ${OVERLAY}).

  UI / BFF:  ${PUBLIC_URL}
  Login:     ${PUBLIC_URL}/auth/login
${data_note}
Smoke checklist:
  1. Only the BFF is on the host. Fuda/Torii/Shaiden stay ClusterIP.
  2. Google operator login → SPA loads; /api/agents and /api/config work same-origin.
  3. Fuda uses k8s SA OIDC (not static mappings):
       kubectl -n keidai exec deploy/fuda -- printenv FUDA_K8S_SA_OIDC_AUDIENCE
  4. Shaiden presents a projected SA token:
       kubectl -n keidai exec deploy/shaiden -- head -c 20 /var/run/secrets/tokens/token
  5. Start a Shaiden run from the UI; token exchange + Torii MCP should succeed.
  6. Torii OAuth link callbacks hit ${PUBLIC_URL}/oauth/callback/...

Tear down:  pnpm k8s:down ${OVERLAY}
EOF
}

main() {
  ensure_overlay
  require_cmd kubectl
  require_cmd docker
  require_cmd openssl

  case "${OVERLAY}" in
    kind)
      require_cmd kind
      ensure_kind_cluster
      kubectl cluster-info >/dev/null
      build_images
      load_images_kind
      ;;
    orbstack)
      ensure_orbstack_cluster
      prepare_orbstack_hostpath
      build_images
      log "OrbStack shares the local Docker store — skipping image load"
      ;;
    *)
      die "unsupported overlay: ${OVERLAY}"
      ;;
  esac

  apply_manifests
  wait_ready
  print_checklist
}

main "$@"

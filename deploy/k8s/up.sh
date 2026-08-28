#!/usr/bin/env bash
# Bring up the Keidai stack via Helm.
# Usage: up.sh [kind|orbstack|k3s]   (default: kind)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
K8S_DIR="${ROOT}/deploy/k8s"
CHART_DIR="${K8S_DIR}/chart"
PROFILE="${1:-${KEIDAI_K8S_OVERLAY:-kind}}"
CLUSTER_NAME="${KEIDAI_KIND_CLUSTER:-keidai}"
NAMESPACE="${KEIDAI_NAMESPACE:-keidai}"
RELEASE="${KEIDAI_HELM_RELEASE:-keidai}"
SECRETS_ENV="${KEIDAI_SECRETS_ENV:-${K8S_DIR}/secrets.env}"
SECRETS_VALUES="${KEIDAI_SECRETS_VALUES:-${K8S_DIR}/secrets-values.yaml}"
PUBLIC_URL="${KEIDAI_PUBLIC_URL:-}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# kind/OrbStack build and load 0.0.0-local. k3s leaves image.tag to the chart
# (Chart.AppVersion) unless KEIDAI_IMAGE_TAG is set — never default k3s to a
# tag the GHCR workflow does not publish.
case "${PROFILE}" in
  kind|orbstack)
    IMAGE_TAG="${KEIDAI_IMAGE_TAG:-0.0.0-local}"
    ;;
  k3s)
    IMAGE_TAG="${KEIDAI_IMAGE_TAG:-}"
    [[ -n "${PUBLIC_URL}" ]] || die "k3s requires KEIDAI_PUBLIC_URL (operator-facing origin, e.g. https://keidai.example.com)"
    ;;
  *)
    die "unknown profile '${PROFILE}' (expected kind, orbstack, or k3s)"
    ;;
esac

IMAGES=(
  "keidai-fuda:${IMAGE_TAG}"
  "keidai-torii:${IMAGE_TAG}"
  "keidai-shaiden:${IMAGE_TAG}"
  "keidai-ui:${IMAGE_TAG}"
)

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

profile_values_file() {
  case "${PROFILE}" in
    kind) printf '%s' "${CHART_DIR}/values-kind.yaml" ;;
    orbstack) printf '%s' "${CHART_DIR}/values-orbstack.yaml" ;;
    k3s) printf '%s' "${CHART_DIR}/values.yaml" ;;
    *) die "unknown profile '${PROFILE}' (expected kind, orbstack, or k3s)" ;;
  esac
}

ensure_kind_cluster() {
  if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
    log "kind cluster '${CLUSTER_NAME}' already exists"
    return
  fi
  log "creating kind cluster '${CLUSTER_NAME}'"
  kind create cluster --name "${CLUSTER_NAME}" --config "${K8S_DIR}/kind/kind-config.yaml"
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

ensure_k3s_cluster() {
  if ! kubectl cluster-info >/dev/null 2>&1; then
    die "kubectl cannot reach a cluster — configure kubeconfig for your k3s node"
  fi
  log "using kubectl context: $(kubectl config current-context 2>/dev/null || echo unknown)"
}

yaml_quote() {
  # Minimal single-quoted YAML scalar (escape embedded single quotes).
  python3 -c 'import sys; print("'\''" + sys.argv[1].replace("'\''", "'\'''\''") + "'\''")' "$1"
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
    KEIDAI_OPERATORS_FILE="${K8S_DIR}/${KEIDAI_OPERATORS_FILE}"
  fi
  if [[ ! -f "${KEIDAI_OPERATORS_FILE}" ]]; then
    die "operators file not found: ${KEIDAI_OPERATORS_FILE} (set KEIDAI_OPERATORS_FILE in ${SECRETS_ENV})"
  fi
  if [[ "${#KEIDAI_SESSION_SECRET}" -lt 32 ]]; then
    die "KEIDAI_SESSION_SECRET must be at least 32 characters"
  fi
}

write_secrets_values() {
  load_secrets_env
  local key_file
  key_file="$(resolve_signing_key)"
  local postgres_password="${POSTGRES_PASSWORD:-keidai-local}"

  log "writing ${SECRETS_VALUES} for Helm (gitignored)"
  {
    printf 'operators: |\n'
    sed 's/^/  /' "${KEIDAI_OPERATORS_FILE}"
    printf '\n'
    printf 'secrets:\n'
    printf '  postgresPassword: %s\n' "$(yaml_quote "${postgres_password}")"
    printf '  openRouterApiKey: %s\n' "$(yaml_quote "${OPEN_ROUTER_API_KEY}")"
    printf '  keidaiGoogleClientId: %s\n' "$(yaml_quote "${KEIDAI_GOOGLE_CLIENT_ID}")"
    printf '  keidaiGoogleClientSecret: %s\n' "$(yaml_quote "${KEIDAI_GOOGLE_CLIENT_SECRET}")"
    printf '  keidaiSessionSecret: %s\n' "$(yaml_quote "${KEIDAI_SESSION_SECRET}")"
    printf '  toriiSecretKey: %s\n' "$(yaml_quote "${TORII_SECRET_KEY:-${KEIDAI_SESSION_SECRET}}")"
    printf '  bffServiceToken: %s\n' "$(yaml_quote "${BFF_SERVICE_TOKEN:-}")"
    printf '  bffServiceTokenDisabled: %s\n' "$(yaml_quote "${BFF_SERVICE_TOKEN_DISABLED:-}")"
    printf '  fudaSigningKey: |\n'
    sed 's/^/    /' "${key_file}"
  } >"${SECRETS_VALUES}"
}

build_images() {
  log "building images (docker compose) with KEIDAI_IMAGE_TAG=${IMAGE_TAG}"
  (
    cd "${ROOT}"
    KEIDAI_IMAGE_TAG="${IMAGE_TAG}" docker compose build
  )
}

load_images_kind() {
  log "loading images into kind"
  for image in "${IMAGES[@]}"; do
    kind load docker-image "${image}" --name "${CLUSTER_NAME}"
  done
}

helm_upgrade() {
  write_secrets_values
  local values_file
  values_file="$(profile_values_file)"
  local -a helm_args=(
    upgrade --install "${RELEASE}" "${CHART_DIR}"
    --namespace "${NAMESPACE}"
    --create-namespace
    -f "${values_file}"
    -f "${SECRETS_VALUES}"
    # Do not pass --wait: Helm waits for Deployments before post-install hooks,
    # but the migrate Job is post-install and app inits wait for schema — deadlock.
    # Hook Jobs still block helm until they succeed. wait_ready covers pods.
    --timeout 10m
  )
  if [[ -n "${IMAGE_TAG}" ]]; then
    helm_args+=(--set "image.tag=${IMAGE_TAG}")
  fi
  if [[ -n "${PUBLIC_URL}" ]]; then
    helm_args+=(--set "publicUrl=${PUBLIC_URL}")
  fi
  if [[ "${PROFILE}" == "k3s" && -n "${KEIDAI_IMAGE_REGISTRY:-}" ]]; then
    helm_args+=(--set "image.registry=${KEIDAI_IMAGE_REGISTRY}")
  fi

  log "helm upgrade --install (profile: ${PROFILE})"
  log "Backup Postgres before upgrades that change schema — helm rollback does not undo migrations."
  helm "${helm_args[@]}"
}

wait_ready() {
  log "waiting for Deployments"
  kubectl -n "${NAMESPACE}" rollout status deployment/postgres --timeout=180s
  kubectl -n "${NAMESPACE}" rollout status deployment/fuda --timeout=180s
  kubectl -n "${NAMESPACE}" rollout status deployment/torii --timeout=180s
  kubectl -n "${NAMESPACE}" rollout status deployment/shaiden --timeout=180s
  kubectl -n "${NAMESPACE}" rollout status deployment/keidai-ui --timeout=180s
}

print_ready() {
  local url="${PUBLIC_URL}"
  if [[ -z "${url}" ]]; then
    case "${PROFILE}" in
      kind|orbstack) url="http://localhost:3000" ;;
      *) url="(set publicUrl / KEIDAI_PUBLIC_URL)" ;;
    esac
  fi
  cat <<EOF

Keidai is up (profile: ${PROFILE}, release: ${RELEASE}).

  UI / BFF:  ${url}
  Login:     ${url}/auth/login

  Register Google OAuth redirect URI: ${url}/auth/callback

Tear down:  pnpm k8s:down ${PROFILE}
EOF
}

main() {
  require_cmd kubectl
  require_cmd helm
  require_cmd openssl
  require_cmd python3

  case "${PROFILE}" in
    kind)
      require_cmd docker
      require_cmd kind
      ensure_kind_cluster
      kubectl cluster-info >/dev/null
      build_images
      load_images_kind
      ;;
    orbstack)
      require_cmd docker
      ensure_orbstack_cluster
      build_images
      log "OrbStack shares the local Docker store — skipping image load"
      ;;
    k3s)
      ensure_k3s_cluster
      log "k3s profile expects images already in the registry (see image.registry / GHCR workflow)"
      ;;
    *)
      die "unsupported profile: ${PROFILE}"
      ;;
  esac

  helm_upgrade
  wait_ready
  print_ready
}

main "$@"

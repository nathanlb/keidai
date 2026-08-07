#!/usr/bin/env bash
# Tear down the Keidai namespace (and optionally the kind cluster).
# Usage: down.sh [kind|orbstack]   (default: kind)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
K8S_DIR="${ROOT}/deploy/k8s"
OVERLAY="${1:-${KEIDAI_K8S_OVERLAY:-kind}}"
OVERLAY_DIR="${K8S_DIR}/overlays/${OVERLAY}"
CLUSTER_NAME="${KEIDAI_KIND_CLUSTER:-keidai}"
NAMESPACE=keidai
DELETE_CLUSTER="${KEIDAI_DELETE_CLUSTER:-0}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[[ -d "${OVERLAY_DIR}" ]] || die "unknown overlay '${OVERLAY}' (expected kind or orbstack)"

# OrbStack kustomize references a generated hostPath patch; ensure it exists
# so delete -k can resolve (does not remove apps/*/data contents).
if [[ "${OVERLAY}" == "orbstack" ]]; then
  local_tmpl="${OVERLAY_DIR}/patch-hostpath-volumes.yaml.tmpl"
  local_out="${OVERLAY_DIR}/patch-hostpath-volumes.yaml"
  if [[ ! -f "${local_out}" && -f "${local_tmpl}" ]]; then
    esc() { printf '%s' "$1" | sed -e 's/[&\\]/\\&/g'; }
    sed \
      -e "s|__KEIDAI_FUDA_DATA__|$(esc "${ROOT}/apps/fuda/data")|g" \
      -e "s|__KEIDAI_TORII_DATA__|$(esc "${ROOT}/apps/torii/data")|g" \
      -e "s|__KEIDAI_SHAIDEN_DATA__|$(esc "${ROOT}/apps/shaiden/data")|g" \
      "${local_tmpl}" >"${local_out}"
  fi
fi

if kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  log "deleting overlay ${OVERLAY} resources"
  kubectl delete -k "${OVERLAY_DIR}" --ignore-not-found
  kubectl delete namespace "${NAMESPACE}" --ignore-not-found --wait=true
else
  log "namespace ${NAMESPACE} not found"
fi

if [[ "${OVERLAY}" == "kind" ]]; then
  if [[ "${DELETE_CLUSTER}" == "1" ]]; then
    if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
      log "deleting kind cluster '${CLUSTER_NAME}'"
      kind delete cluster --name "${CLUSTER_NAME}"
    fi
  else
    log "kind cluster retained (set KEIDAI_DELETE_CLUSTER=1 to delete)"
  fi
else
  log "left the ${OVERLAY} cluster running (disable Kubernetes in OrbStack if you want it off)"
  log "hostPath SQLite data kept at apps/{fuda,torii,shaiden}/data (delete those DBs to reset)"
fi

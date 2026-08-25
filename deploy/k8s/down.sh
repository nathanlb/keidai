#!/usr/bin/env bash
# Tear down the Keidai Helm release (and optionally the kind cluster).
# Usage: down.sh [kind|orbstack|k3s]   (default: kind)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROFILE="${1:-${KEIDAI_K8S_OVERLAY:-kind}}"
CLUSTER_NAME="${KEIDAI_KIND_CLUSTER:-keidai}"
NAMESPACE="${KEIDAI_NAMESPACE:-keidai}"
RELEASE="${KEIDAI_HELM_RELEASE:-keidai}"
DELETE_CLUSTER="${KEIDAI_DELETE_CLUSTER:-0}"
DELETE_PVC="${KEIDAI_DELETE_PVC:-0}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

case "${PROFILE}" in
  kind|orbstack|k3s) ;;
  *) die "unknown profile '${PROFILE}' (expected kind, orbstack, or k3s)" ;;
esac

if helm status "${RELEASE}" -n "${NAMESPACE}" >/dev/null 2>&1; then
  log "helm uninstall ${RELEASE} (namespace ${NAMESPACE})"
  helm uninstall "${RELEASE}" -n "${NAMESPACE}" --wait || true
else
  log "Helm release '${RELEASE}' not found in namespace ${NAMESPACE}"
fi

if [[ "${DELETE_PVC}" == "1" ]]; then
  log "deleting postgres-data PVC (KEIDAI_DELETE_PVC=1)"
  kubectl -n "${NAMESPACE}" delete pvc postgres-data --ignore-not-found --wait=true
else
  log "postgres-data PVC retained (helm.sh/resource-policy: keep; set KEIDAI_DELETE_PVC=1 to wipe)"
fi

if kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  # Leave namespace if other resources remain (kept PVC).
  if [[ "${DELETE_PVC}" == "1" ]]; then
    log "deleting namespace ${NAMESPACE}"
    kubectl delete namespace "${NAMESPACE}" --ignore-not-found --wait=true
  fi
fi

if [[ "${PROFILE}" == "kind" ]]; then
  if [[ "${DELETE_CLUSTER}" == "1" ]]; then
    if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
      log "deleting kind cluster '${CLUSTER_NAME}'"
      kind delete cluster --name "${CLUSTER_NAME}"
    fi
  else
    log "kind cluster retained (set KEIDAI_DELETE_CLUSTER=1 to delete)"
  fi
else
  log "left the ${PROFILE} cluster running"
fi

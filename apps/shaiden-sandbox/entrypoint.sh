#!/bin/sh
set -eu

# Root (this server) may open connections, including the Fuda JWKS fetch.
# Every other uid — the executed interpreter — is dropped, loopback included.
apply_output_policy() {
  "$1" -F OUTPUT
  "$1" -A OUTPUT -m owner --uid-owner 0 -j ACCEPT
  "$1" -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  "$1" -A OUTPUT -j DROP
}

apply_output_policy iptables
if ! apply_output_policy ip6tables; then
  echo "ip6tables unavailable; IPv6 policy not applied" >&2
fi

# Shared sticky dirs would let one run read another's files.
chmod 755 /tmp
if [ -d /dev/shm ]; then
  chmod 755 /dev/shm
fi

# Container-wide PID cap, matching Compose. Per-run RLIMIT_NPROC is tighter.
PIDS_LIMIT="${SANDBOX_PIDS_LIMIT:-128}"
for pids_max in /sys/fs/cgroup/pids.max /sys/fs/cgroup/pids/pids.max; do
  if [ -w "$pids_max" ]; then
    echo "$PIDS_LIMIT" > "$pids_max" || true
  fi
done

exec python -u /app/server.py

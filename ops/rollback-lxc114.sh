#!/bin/bash
# ops/rollback-lxc114.sh — roll back LXC 114 to a previous snapshot.
#
# Usage:
#   ops/rollback-lxc114.sh <snapname>
#
# Proxmox stops the container during a rollback (verified behaviour) but does
# not restart it automatically; this script restarts it and waits for the
# site to come back, then runs the health check.
#
# Token decrypted at runtime from the local GPG vault, never hardcoded.
set -uo pipefail

PVE_HOST="${PVE_HOST:-192.168.1.77}"
PVE_NODE="${PVE_NODE:-pve}"
VMID="${OSDB_VMID:-114}"
BASE_URL="${OSDB_BASE_URL:-http://192.168.1.201:3000}"
TOKEN_SRC="${PVE_TOKEN_GPG:-/home/simone/.hermes/secrets/proxmox-token.gpg}"
HEALTH_CHECK="$(cd "$(dirname "$0")" && pwd)/health-check.sh"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

if [ $# -lt 1 ]; then
  echo "usage: $0 <snapname>" >&2
  echo "snapshots available:" >&2
  TOKEN=$(gpg -d --batch --quiet "$TOKEN_SRC" 2>/dev/null)
  curl -sk -H "Authorization: PVEAPIToken=$TOKEN" \
    "https://$PVE_HOST:8006/api2/json/nodes/$PVE_NODE/lxc/$VMID/snapshot" 2>/dev/null \
    | python3 -c "
import json,sys
d=json.load(sys.stdin).get('data',[])
for s in d: print(' -', s.get('name'))" 2>/dev/null
  exit 2
fi

SNAP="$1"
if [ ! -r "$TOKEN_SRC" ]; then
  echo "$(ts) ERROR: token vault $TOKEN_SRC not readable" >&2
  exit 2
fi
TOKEN=$(gpg -d --batch --quiet "$TOKEN_SRC" 2>/dev/null)
[ -n "$TOKEN" ] || { echo "$(ts) ERROR: could not decrypt PVE token" >&2; exit 2; }

API="https://$PVE_HOST:8006/api2/json"

echo "$(ts) ROLLBACK vmid=$VMID to snapshot '$SNAP'"
UPID=$(curl -sk -X POST -H "Authorization: PVEAPIToken=$TOKEN" \
  "$API/nodes/$PVE_NODE/lxc/$VMID/snapshot/$SNAP/rollback" 2>/dev/null \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('data',''))" 2>/dev/null)

if [ -z "$UPID" ]; then
  echo "$(ts) ERROR: rollback not accepted (snapshot exists?)" >&2
  exit 1
fi
echo "$(ts) rollback task upid=$UPID"

# wait for the rollback task to finish (container is stopped by Proxmox):
# poll the task status like backup-lxc114.sh instead of a fixed sleep
t=0
while [ $t -lt 1800 ]; do
  st=$(curl -sk -H "Authorization: PVEAPIToken=$TOKEN" \
    "$API/nodes/$PVE_NODE/tasks/$UPID/status" 2>/dev/null \
    | python3 -c "import json,sys;d=json.load(sys.stdin).get('data',{});print(d.get('status'), d.get('exitstatus',''))" 2>/dev/null)
  echo "$st" | grep -q '^running' || break
  sleep 10
  t=$((t+10))
done

case "$st" in
  "stopped OK")
    echo "$(ts) rollback finished OK (${t}s)"
    ;;
  *)
    echo "$(ts) ERROR: rollback task ended with status: $st" >&2
    exit 4
    ;;
esac

echo "$(ts) restarting container"
curl -sk -X POST -H "Authorization: PVEAPIToken=$TOKEN" \
  "$API/nodes/$PVE_NODE/lxc/$VMID/status/start" >/dev/null 2>&1

# wait for the site
for i in $(seq 1 36); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE_URL/" 2>/dev/null)
  if [ "$code" = "200" ]; then
    echo "$(ts) site up after ${i}x5s: HTTP $code"
    break
  fi
  sleep 5
done

echo "$(ts) running health check"
if [ -x "$HEALTH_CHECK" ]; then
  "$HEALTH_CHECK" 2>&1
  echo "$(ts) health exit=$?"
else
  echo "$(ts) WARN health-check.sh not found next to rollback script"
fi

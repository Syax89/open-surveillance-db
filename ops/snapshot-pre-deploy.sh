#!/bin/bash
# ops/snapshot-pre-deploy.sh — take a Proxmox snapshot of LXC 114 before a
# deploy/update, to serve as the rollback base.
#
# Usage:
#   ops/snapshot-pre-deploy.sh [snapname]
# Default snapname: pre-deploy-YYYYMMDD-HHMMSS
#
# Token decrypted at runtime from the local GPG vault, never hardcoded.
set -uo pipefail

PVE_HOST="${PVE_HOST:-192.168.1.77}"
PVE_NODE="${PVE_NODE:-pve}"
VMID="${OSDB_VMID:-114}"
TOKEN_SRC="${PVE_TOKEN_GPG:-/home/simone/.hermes/secrets/proxmox-token.gpg}"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

if [ ! -r "$TOKEN_SRC" ]; then
  echo "$(ts) ERROR: token vault $TOKEN_SRC not readable" >&2
  exit 2
fi
TOKEN=$(gpg -d --batch --quiet "$TOKEN_SRC" 2>/dev/null)
[ -n "$TOKEN" ] || { echo "$(ts) ERROR: could not decrypt PVE token" >&2; exit 2; }

SNAP="${1:-pre-deploy-$(date +%Y%m%d-%H%M%S)}"
API="https://$PVE_HOST:8006/api2/json"

echo "$(ts) snapshot $SNAP on vmid=$VMID"
RESP=$(curl -sk -X POST -H "Authorization: PVEAPIToken=$TOKEN" \
  --data-urlencode "snapname=$SNAP" \
  --data-urlencode "description=pre-deploy rollback base (ops/snapshot-pre-deploy.sh)" \
  "$API/nodes/$PVE_NODE/lxc/$VMID/snapshot" 2>/dev/null)
echo "$RESP"

if echo "$RESP" | grep -q '"data"'; then
  echo "$(ts) OK snapshot created: $SNAP"
else
  echo "$(ts) ERROR creating snapshot" >&2
  exit 1
fi

# list current snapshots for confirmation
echo "$(ts) current snapshots:"
curl -sk -H "Authorization: PVEAPIToken=$TOKEN" \
  "$API/nodes/$PVE_NODE/lxc/$VMID/snapshot" 2>/dev/null \
  | python3 -c "
import json,sys
d=json.load(sys.stdin).get('data',[])
for s in d: print(' -', s.get('name'))" 2>/dev/null

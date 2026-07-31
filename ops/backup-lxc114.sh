#!/bin/bash
# ops/backup-lxc114.sh — automated backup of LXC 114 (osdb-test) to the NAS.
#
# Runs a Proxmox vzdump (snapshot mode, zstd) of the container onto the
# configured CIFS storage "NAS", then verifies the produced archive is
# listed by the storage content API. The D1 sqlite database lives inside
# the container rootfs and is therefore included in the archive (verified:
# .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite).
#
# The Proxmox API token is NOT hardcoded: it is decrypted at runtime from
# the local GPG vault (~/.hermes/secrets/proxmox-token.gpg). The vault file
# must exist on the machine that runs this script.
#
# Install (cron, daily 02:30):
#   30 2 * * * /path/to/repo/ops/backup-lxc114.sh >> /home/simone/logs/osdb-backup.log 2>&1
set -uo pipefail

PVE_HOST="${PVE_HOST:-192.168.1.77}"
PVE_NODE="${PVE_NODE:-pve}"
VMID="${OSDB_VMID:-114}"
STORAGE="${OSDB_BACKUP_STORAGE:-NAS}"
TOKEN_SRC="${PVE_TOKEN_GPG:-/home/simone/.hermes/secrets/proxmox-token.gpg}"
LOG="${OSDB_BACKUP_LOG:-/home/simone/logs/osdb-backup.log}"
KEEP="${OSDB_BACKUP_KEEP:-7}"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

if [ ! -r "$TOKEN_SRC" ]; then
  echo "$(ts) ERROR: token vault $TOKEN_SRC not readable" >&2
  exit 2
fi
TOKEN=$(gpg -d --batch --quiet "$TOKEN_SRC" 2>/dev/null)
[ -n "$TOKEN" ] || { echo "$(ts) ERROR: could not decrypt PVE token" >&2; exit 2; }

API="https://$PVE_HOST:8006/api2/json"

echo "$(ts) backup start vmid=$VMID storage=$STORAGE"

# 1) trigger vzdump (snapshot mode keeps the container running)
UPID=$(curl -sk -X POST -H "Authorization: PVEAPIToken=$TOKEN" \
  --data-urlencode "vmid=$VMID" \
  --data-urlencode "storage=$STORAGE" \
  --data-urlencode "mode=snapshot" \
  --data-urlencode "compress=zstd" \
  --data-urlencode "prune-backups=keep-last=$KEEP" \
  --data-urlencode "notes-template={{guestname}} automated backup" \
  "$API/nodes/$PVE_NODE/vzdump" 2>/dev/null \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('data',''))" 2>/dev/null)

if [ -z "$UPID" ]; then
  echo "$(ts) ERROR: vzdump not accepted (check token permissions/storage)" >&2
  exit 3
fi
echo "$(ts) vzdump upid=$UPID"

# 2) wait for completion (up to 30 min)
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
    echo "$(ts) vzdump finished OK (${t}s)"
    ;;
  *)
    echo "$(ts) ERROR: vzdump ended with status: $st" >&2
    exit 4
    ;;
esac

# 3) verify the archive is listed on the NAS storage
ARC=$(curl -sk -H "Authorization: PVEAPIToken=$TOKEN" \
  "$API/nodes/$PVE_NODE/storage/$STORAGE/content" 2>/dev/null \
  | python3 -c "
import json,sys
d=json.load(sys.stdin).get('data',[])
hits=[i['volid'] for i in d if 'vzdump-lxc-$VMID-' in i.get('volid','')]
print(hits[-1] if hits else '')" 2>/dev/null)

if [ -n "$ARC" ]; then
  echo "$(ts) OK verified on NAS: $ARC"
  # prune handled by vzdump prune-backups; confirm count
  n=$(curl -sk -H "Authorization: PVEAPIToken=$TOKEN" \
    "$API/nodes/$PVE_NODE/storage/$STORAGE/content" 2>/dev/null \
    | python3 -c "
import json,sys
d=json.load(sys.stdin).get('data',[])
print(sum(1 for i in d if 'vzdump-lxc-$VMID-' in i.get('volid','')))" 2>/dev/null)
  echo "$(ts) total LXC $VMID archives on NAS: $n (keep=$KEEP)"
else
  echo "$(ts) ERROR: archive not found on $STORAGE content" >&2
  exit 5
fi

echo "$(ts) backup OK"

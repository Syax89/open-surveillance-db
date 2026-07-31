#!/bin/bash
# ops/health-check.sh — periodic health check for the local LXC 114 deploy.
#
# Verifies the key HTTP routes of the local test site (192.168.1.201:3000)
# and exits non-zero when any check fails. Designed to run from cron on the
# workstation that can reach the LAN IP.
#
# Install (cron):
#   */5 * * * * /path/to/repo/ops/health-check.sh >> /home/simone/logs/osdb-health.log 2>&1
#
# Routes and expected codes (mirrors docs/DEPLOYMENT.md "Verification"):
#   /                       -> 200  (homepage + asset bundle)
#   /api/cameras            -> 200  (public API, D1 reachable)
#   /api/cameras/nearby     -> 200  (geospatial query path)
#   /guide                  -> 200  (static guide page)
#   /api/moderation         -> 503  (fail-closed without credentials, NEVER 200)
set -uo pipefail

BASE="${OSDB_BASE_URL:-http://192.168.1.201:3000}"
LOG="${OSDB_HEALTH_LOG:-/home/simone/logs/osdb-health.log}"
FAIL_MARKER="${OSDB_FAIL_MARKER:-/tmp/osdb-health-FAIL}"

# route|expected_code
ROUTES=(
  "/|200"
  "/api/cameras|200"
  "/api/cameras/nearby?latitude=41.9004&longitude=12.4936&radius=50|200"
  "/guide|200"
  "/api/moderation|503"
)

ts() { date '+%Y-%m-%d %H:%M:%S'; }

fail=0
line="$(ts) check start"
echo "$line"
for entry in "${ROUTES[@]}"; do
  path="${entry%%|*}"
  want="${entry##*|}"
  got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE$path" 2>/dev/null)
  if [ "$got" = "$want" ]; then
    echo "$(ts) OK   $path -> $got"
  else
    echo "$(ts) FAIL $path -> $got (wanted $want)"
    fail=1
  fi
done

if [ "$fail" -eq 0 ]; then
  rm -f "$FAIL_MARKER"
  echo "$(ts) HEALTH OK"
else
  echo "$(ts) HEALTH FAILED"
  touch "$FAIL_MARKER"
fi

exit $fail

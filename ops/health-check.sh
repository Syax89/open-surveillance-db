#!/bin/bash
# ops/health-check.sh — periodic health check for the local test deployment.
#
# Verifies the key HTTP routes of the local test site (<lan-ip>:3000)
# and exits non-zero when any check fails. Designed to run from cron on the
# workstation that can reach the LAN IP.
#
# Install (cron):
#   */5 * * * * /path/to/repo/ops/health-check.sh >> <log-dir>/osdb-health.log 2>&1
#
# Routes and expected codes (mirrors docs/DEPLOYMENT.md "Verification"):
#   /                       -> 200  (homepage + asset bundle)
#   /api/cameras            -> 200  (public API, D1 reachable)
#   /api/cameras/nearby     -> 200  (geospatial query path)
#   /guide                  -> 200  (static guide page)
#   /api/moderation         -> 503  (fail-closed without credentials, NEVER 200)
set -uo pipefail

BASE="${OSDB_BASE_URL:-http://<lan-ip>:3000}"   # imposta OSDB_BASE_URL
LOG="${OSDB_HEALTH_LOG:-<log-dir>/osdb-health.log}"   # imposta OSDB_HEALTH_LOG
FAIL_MARKER="${OSDB_FAIL_MARKER:-/tmp/osdb-health-FAIL}"

# PITFALL (audit ops 2026-08-09): il default contiene il placeholder
# <lan-ip> — se OSDB_BASE_URL non è impostato nella crontab, ogni curl
# risolve un host inesistente e il check fallisce con 000 su TUTTE le
# route. Meglio un errore chiaro subito invece di un log pieno di 000.
if [[ "$BASE" == *"<lan-ip>"* ]]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: OSDB_BASE_URL non impostato (placeholder ancora nel default). Aggiungi OSDB_BASE_URL=http://<lan-ip>:3000 alla riga crontab (OPERATIONS.md §8.1)." >&2
  exit 2
fi
if [[ "$LOG" == *"<log-dir>"* ]]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: OSDB_HEALTH_LOG non impostato (placeholder ancora nel default)." >&2
  exit 2
fi

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

# --- Alerting (audit ops 2026-08-09) ---
# Su failure apre (o riusa) una issue GitHub "ops: health check FAILED",
# stesso canale di .github/workflows/ops-monitoring.yml. Attivazione:
#   OSDB_GH_ALERT=1 nella crontab (e opzionale OSDB_GH_REPO=<owner/repo>);
# richiede `gh` autenticato sulla workstation. Senza OSDB_GH_ALERT=1 il
# comportamento resta identico a prima (solo log + marker).
if [ "$fail" -ne 0 ] && [ "${OSDB_GH_ALERT:-0}" = "1" ]; then
  GH_REPO="${OSDB_GH_REPO:-Syax89/open-surveillance-db}"
  if command -v gh >/dev/null 2>&1; then
    if ! gh issue list --repo "$GH_REPO" --state open --json number,title \
        -q '.[] | select(.title | startswith("ops: health check FAILED"))' | grep -q .; then
      gh issue create --repo "$GH_REPO" --label ops \
        --title "ops: health check FAILED ($(date -u +%Y-%m-%dT%H:%M:%SZ))" \
        --body "Il health check locale (ops/health-check.sh) ha rilevato un failure. Ultima riga del log: $(tail -1 "$LOG" 2>/dev/null || echo 'log non leggibile'). Runbook: docs/OPERATIONS.md §4." \
        >/dev/null 2>&1 && echo "$(ts) ALERT: issue GitHub aperta su $GH_REPO"
    else
      echo "$(ts) ALERT: issue già aperta su $GH_REPO (nessuna duplicazione)"
    fi
  else
    echo "$(ts) ALERT: gh non disponibile — alerting GitHub saltato"
  fi
fi

exit $fail

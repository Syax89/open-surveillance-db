#!/bin/bash
# ops/oidc-secrets.sh — manage the OIDC provider client credentials
# (Fase D, t_87f24b2d) in the local GPG vault.
#
# The client ID/secret pairs for GitHub and Google NEVER live in the repo:
# wrangler.jsonc, .dev.vars and the source tree are all gitignored for
# secrets. This script is the single place that stores/retrieves them, so
# the operator (or the deploy runbook) can activate a provider without ever
# pasting a secret into a shell history line that ends up in a log.
#
# Vault layout (same convention as ops/snapshot-pre-deploy.sh):
#   ~/.hermes/secrets/oidc-<provider>.env.gpg
#   plaintext inside:  CLIENT_ID=... and CLIENT_SECRET=... (two lines)
#
# Usage:
#   ops/oidc-secrets.sh store <github|google>      prompt + encrypt into vault
#   ops/oidc-secrets.sh show  <github|google>      decrypt to stdout (never logged)
#   ops/oidc-secrets.sh dev   <github|google>      write/refresh .dev.vars (local wrangler)
#   ops/oidc-secrets.sh deploy <github|google>     pipe into `wrangler secret put` (production)
#
# Environment:
#   OIDC_VAULT_DIR   vault directory (default ~/.hermes/secrets)
#   OIDC_GPG_KEY     recipient override (default: the vault's default key;
#                    gpg -d works with any key that can decrypt the file)
set -uo pipefail

VAULT_DIR="${OIDC_VAULT_DIR:-$HOME/.hermes/secrets}"
PROVIDERS="github google"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

usage() {
  echo "usage: $0 {store|show|dev|deploy} <github|google>" >&2
  exit 2
}

[ $# -eq 2 ] || usage
ACTION="$1"
PROVIDER="$2"
case " $PROVIDERS " in
  *" $PROVIDER "*) ;;
  *) usage ;;
esac

VAULT_FILE="$VAULT_DIR/oidc-$PROVIDER.env.gpg"

# Decrypt to stdout; nothing is ever echoed back to the terminal.
decrypt() {
  gpg -d --batch --quiet "$VAULT_FILE" 2>/dev/null || {
    echo "$(ts) ERROR: could not decrypt $VAULT_FILE" >&2
    exit 2
  }
}

case "$ACTION" in
  store)
    mkdir -p "$VAULT_DIR"
    echo "$(ts) storing OIDC credentials for provider '$PROVIDER'"
    echo "Paste the client ID, then the client secret (input is hidden):"
    read -r -p "Client ID: " CLIENT_ID
    read -r -s -p "Client secret: " CLIENT_SECRET
    echo
    [ -n "$CLIENT_ID" ] || { echo "$(ts) ERROR: empty client id" >&2; exit 2; }
    [ -n "$CLIENT_SECRET" ] || { echo "$(ts) ERROR: empty client secret" >&2; exit 2; }
    umask 077
    printf 'CLIENT_ID=%s\nCLIENT_SECRET=%s\n' "$CLIENT_ID" "$CLIENT_SECRET" \
      | gpg --batch --yes --quiet --encrypt \
        ${OIDC_GPG_KEY:+--recipient "$OIDC_GPG_KEY"} \
        --output "$VAULT_FILE" 2>/dev/null
    [ -f "$VAULT_FILE" ] && chmod 600 "$VAULT_FILE" || {
      echo "$(ts) ERROR: encryption failed" >&2
      exit 2
    }
    echo "$(ts) OK stored $VAULT_FILE"
    ;;
  show)
    [ -r "$VAULT_FILE" ] || { echo "$(ts) ERROR: vault file $VAULT_FILE missing (run 'store' first)" >&2; exit 2; }
    decrypt
    ;;
  dev)
    [ -r "$VAULT_FILE" ] || { echo "$(ts) ERROR: vault file $VAULT_FILE missing (run 'store' first)" >&2; exit 2; }
    # Refresh the two OIDC vars in .dev.vars without touching the others.
    touch .dev.vars
    chmod 600 .dev.vars
    ENV_PREFIX="OIDC_${PROVIDER^^}_"
    # Drop stale keys first, then append the decrypted pair.
    grep -v "^${ENV_PREFIX}CLIENT_ID=\|^${ENV_PREFIX}CLIENT_SECRET=" .dev.vars > .dev.vars.tmp
    decrypt | while IFS='=' read -r KEY VALUE; do
      echo "${ENV_PREFIX}${KEY}=${VALUE}"
    done >> .dev.vars.tmp
    mv .dev.vars.tmp .dev.vars
    echo "$(ts) OK .dev.vars now has ${ENV_PREFIX}CLIENT_ID / ${ENV_PREFIX}CLIENT_SECRET"
    ;;
  deploy)
    [ -r "$VAULT_FILE" ] || { echo "$(ts) ERROR: vault file $VAULT_FILE missing (run 'store' first)" >&2; exit 2; }
    ENV_PREFIX="OIDC_${PROVIDER^^}_"
    decrypt | while IFS='=' read -r KEY VALUE; do
      echo "$(ts) putting secret ${ENV_PREFIX}${KEY} (production)..."
      printf '%s' "$VALUE" | wrangler secret put "${ENV_PREFIX}${KEY}" 2>&1 | tail -2
    done
    echo "$(ts) OK provider '$PROVIDER' secrets deployed to Cloudflare"
    ;;
  *)
    usage
    ;;
esac

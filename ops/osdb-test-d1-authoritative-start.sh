#!/bin/sh
# Installed on LXC 114 as /usr/local/libexec/osdb-test-d1-authoritative-start.
# systemd supplies the encrypted credential at $CREDENTIALS_DIRECTORY; it is
# deliberately not put in .dev.vars or in the repository configuration.
set -eu

credential_dir=${CREDENTIALS_DIRECTORY:?CREDENTIALS_DIRECTORY is required}
token_file="$credential_dir/cloudflare_api_token"
if [ ! -r "$token_file" ]; then
  echo "osdb-test: encrypted Cloudflare D1 credential is unavailable" >&2
  exit 78
fi

export CLOUDFLARE_API_TOKEN="$(cat "$token_file")"
exec /opt/open-surveillance-db/node_modules/.bin/vinext dev --port 3000 --hostname 0.0.0.0

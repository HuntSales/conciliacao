#!/bin/sh
# Run on the server, inside /opt/apps/conciliacao. Pulls latest main, rebuilds
# the image with the public VITE_ vars as build args (baked into the client
# bundle), and *recreates* the container — `docker restart` does NOT reread
# --env-file, so it never picks up .env changes.
set -eu

cd "$(dirname "$0")"
git pull --ff-only

set -a
# shellcheck disable=SC1091
. ./.env
set +a

docker build \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
  --build-arg VITE_SUPABASE_PROJECT_ID="$VITE_SUPABASE_PROJECT_ID" \
  -t conciliacao:latest .

docker rm -f conciliacao 2>/dev/null || true
docker run -d --name conciliacao --restart unless-stopped \
  --env-file ./.env -e PORT=3000 -p 127.0.0.1:3004:3000 \
  conciliacao:latest

sleep 2
curl -sf -o /dev/null http://127.0.0.1:3004/ && echo "OK: conciliacao respondendo em 127.0.0.1:3004"

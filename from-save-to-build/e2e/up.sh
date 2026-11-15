#!/usr/bin/env bash
# Builds a fresh e2e database, the web export, and starts the dev gateway + static server, then runs the browser flow.
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/dev-db.sh fstb_e2e >/dev/null 2>&1
pkill -f "e2e/serve.mjs" 2>/dev/null || true; pkill -f "PORT=54331" 2>/dev/null || true
(fuser -k 54331/tcp 8099/tcp >/dev/null 2>&1 || true)
rm -rf dev/.data
PORT=54331 DATABASE_URL=postgres://fstb_admin:dev@127.0.0.1:5432/fstb_e2e npx tsx dev/gateway.ts > /tmp/fstb-e2e-gateway.log 2>&1 &
GW=$!
sleep 2
KEY=$(grep -o 'ANON_KEY=.*' /tmp/fstb-e2e-gateway.log | cut -d= -f2)
if [ "${SKIP_BUILD:-0}" != "1" ]; then (cd mobile && EXPO_PUBLIC_SUPABASE_URL=http://localhost:54331 EXPO_PUBLIC_SUPABASE_ANON_KEY=$KEY npx expo export -p web >/dev/null 2>&1); fi
node e2e/serve.mjs mobile/dist 8099 >/dev/null 2>&1 &
SV=$!
sleep 1
set +e; node e2e/run.mjs; CODE=$?; set -e
kill $GW $SV 2>/dev/null || true
exit $CODE

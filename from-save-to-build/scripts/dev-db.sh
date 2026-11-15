#!/usr/bin/env bash
# Rebuilds the local development database on plain PostgreSQL (no Docker / Supabase CLI needed).
# Applies: dev shim -> real migrations -> seed.   Usage: scripts/dev-db.sh [dbname]
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${1:-fstb_dev}"
PSQL_SUPER=${PSQL_SUPER:-"su postgres -c"}
run_super() { if [ "$(id -u)" = "0" ]; then su postgres -c "$1"; else bash -c "$1"; fi; }
pg_lsclusters 2>/dev/null | grep -q online || pg_ctlcluster 16 main start 2>/dev/null || true
run_super "psql -qAtc \"do \\\$\\\$ begin if not exists (select from pg_roles where rolname='fstb_admin') then create role fstb_admin superuser login password 'dev'; end if; end \\\$\\\$\""
run_super "psql -qc 'drop database if exists $DB with (force)'"
run_super "psql -qc 'create database $DB owner fstb_admin'"
export PGPASSWORD=dev
P="psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U fstb_admin -d $DB"
$P -f supabase/dev/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do echo "migrate: $f"; $P -f "$f"; done
if [ "${SKIP_SEED:-0}" != "1" ]; then echo "seed"; $P -f supabase/seed.sql; fi
echo "ok: $DB"

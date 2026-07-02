#!/usr/bin/env bash
#
# Swarms — Postgres restore from a logical backup.
#
# Restores a pg_dump custom-format file produced by scripts/backup.sh into a
# TARGET database. This is destructive to the target; restore into a scratch
# instance first and run reconciliation (GET /api/admin/reconcile) before cutover.
# See docs/INCIDENT_RESPONSE.md.
#
# Usage:
#   TARGET_DATABASE_URL=postgres://... ./scripts/restore.sh path/to/swarms_*.dump
#
set -euo pipefail

: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
DUMP="${1:?path to .dump file is required}"

if [[ ! -f "$DUMP" ]]; then
  echo "No such dump file: $DUMP" >&2
  exit 1
fi

echo "Restoring $DUMP into the target database ..."
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$TARGET_DATABASE_URL" "$DUMP"

echo "Restore complete. Next:"
echo "  1) npm run db:migrate   # if the dump predates the deployed schema"
echo "  2) GET /api/admin/reconcile per org to verify ledger integrity"

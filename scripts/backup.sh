#!/usr/bin/env bash
#
# Hermes Cloud — Postgres logical backup.
#
# Postgres is the only stateful system of record (see docs/BACKUPS.md). This
# takes a compressed, consistent custom-format dump suitable for pg_restore.
# For production, prefer managed PITR; use this for ad-hoc / pre-migration snapshots.
#
# Usage:
#   DATABASE_URL=postgres://... ./scripts/backup.sh [output_dir]
#
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/hermes_${STAMP}.dump"

echo "Backing up to $FILE ..."
pg_dump --format=custom --no-owner --no-privileges --compress=9 \
  --file="$FILE" "$DATABASE_URL"

echo "Wrote $(du -h "$FILE" | cut -f1) -> $FILE"
echo "Verify with: pg_restore --list \"$FILE\" | head"

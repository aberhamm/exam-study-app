#!/usr/bin/env bash
set -euo pipefail

# --- config file discovery ---
# You can override with: CONFIG=path/to/file scripts/db/sync_prod_to_local.sh
CONFIG="${CONFIG:-config/env/mongo/.env.local}"

if [[ ! -f "$CONFIG" ]]; then
  echo "[error] Config file not found at: $CONFIG"
  echo "        Create it from the template: cp config/env/mongo/.env.example $CONFIG"
  exit 1
fi

# Load env vars from config (export all while sourcing, then stop exporting)
set -a
# shellcheck disable=SC1090
source "$CONFIG"
set +a

# --- derived/optional defaults ---
KEEP_DAYS="${KEEP_DAYS:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../.. && pwd)"
OUT_DIR="$ROOT/backups"
mkdir -p "$OUT_DIR"

ARCHIVE="$OUT_DIR/${DB_NAME}_${STAMP}.gz"

echo "[info] Dumping $DB_NAME from prod to $ARCHIVE"
mongodump \
  --uri="$PROD_URI" \
  --db="$DB_NAME" \
  --readPreference=secondaryPreferred \
  --numParallelCollections=4 \
  --gzip --archive="$ARCHIVE"

echo "[info] Restoring to local db $LOCAL_DB_NAME"
mongorestore \
  --uri="$LOCAL_URI" \
  --gzip --archive="$ARCHIVE" \
  --nsFrom="$DB_NAME.*" \
  --nsTo="$LOCAL_DB_NAME.*" \
  --drop

echo "[info] Pruning backups older than $KEEP_DAYS days"
find "$OUT_DIR" -type f -name "${DB_NAME}_*.gz" -mtime +"$KEEP_DAYS" -print -delete

echo "[done] $(date)"

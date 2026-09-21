#!/bin/sh
# Backup del DB STEGO — eseguito ogni notte da cron (vedi entrypoint.sh)
BACKUP_DIR="${BACKUP_DIR:-/app/data/backups}"
DB_PATH="${DB_PATH:-/app/data/stego.db}"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
# .backup di sqlite3 invece di cp: con journal_mode=WAL una copia grezza
# può cogliere il file a metà transazione e produrre un backup inutilizzabile.
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/stego_$DATE.db'"
else
  cp "$DB_PATH" "$BACKUP_DIR/stego_$DATE.db"
fi
# Conserva solo gli ultimi 30
ls -t "$BACKUP_DIR"/stego_*.db 2>/dev/null | tail -n +31 | xargs -r rm -f
echo "[backup] $DATE - OK"

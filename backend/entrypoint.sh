#!/bin/sh
set -e

# Il TLS lo termina il reverse proxy davanti allo stack: qui si parla HTTP
# sulla 3000. Il certificato self-signed serve solo se si espone il
# container direttamente, e va chiesto esplicitamente.
if [ "$TLS_SELF_SIGNED" = "true" ] && [ ! -f /app/certs/server.crt ]; then
  mkdir -p /app/certs
  echo "Generating SSL certificate for IP: ${SERVER_IP:-127.0.0.1}"
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /app/certs/server.key \
    -out    /app/certs/server.crt \
    -subj   "/CN=${SERVER_NAME:-stego}" \
    -addext "subjectAltName=IP:${SERVER_IP:-127.0.0.1},DNS:localhost"
fi

# Backup automatico del DB, di default ogni notte alle 02:00
BACKUP_CRON="${BACKUP_CRON:-0 2 * * *}"
echo "$BACKUP_CRON /app/backup.sh >> /app/data/backup.log 2>&1" | crontab -
crond -b 2>/dev/null || true

if [ "$NODE_ENV" = "development" ]; then
  exec npx nodemon --watch . --ext js,json --ignore data/ --ignore certs/ --ignore node_modules/ server.js
else
  exec node server.js
fi

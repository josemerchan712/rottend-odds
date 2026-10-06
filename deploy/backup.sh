#!/usr/bin/env bash
# Copia de seguridad de PostgreSQL (pg_dump en formato custom, comprimido) con rotación de 14 días.
#
#   deploy/backup.sh
#
# Variables (todas opcionales):
#   ENV_FILE      .env de producción, fuera del repo          (por defecto /opt/rottenodds/.env.prod)
#   BACKUP_DIR    carpeta de copias, se crea con permisos 700  (por defecto /var/backups/rottenodds)
#   KEEP_DAYS     días que se guardan las copias               (por defecto 14)
#   COMPOSE_FILE  archivo de Compose                           (por defecto docker-compose.prod.yml del repo)
#
# Cada copia se comprueba con pg_restore --list antes de darla por buena. Ver DEPLOY.md («Copias de seguridad»).
set -euo pipefail
umask 077

REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${ENV_FILE:-/opt/rottenodds/.env.prod}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/rottenodds}
KEEP_DAYS=${KEEP_DAYS:-14}
COMPOSE_FILE=${COMPOSE_FILE:-$REPO_DIR/docker-compose.prod.yml}

compose=(docker compose -f "$COMPOSE_FILE")
[[ -f "$ENV_FILE" ]] && compose+=(--env-file "$ENV_FILE")

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="$BACKUP_DIR/casino-$stamp.dump"
tmp="$BACKUP_DIR/.casino-$stamp.dump.partial"
trap 'rm -f "$tmp"' EXIT

"${compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d casino --format=custom --compress=9 --no-owner --no-privileges' > "$tmp"
# Una copia que no se puede leer no es una copia.
"${compose[@]}" exec -T db pg_restore --list < "$tmp" > /dev/null

mv "$tmp" "$out"
chmod 600 "$out"

# Rotación: borra las copias de más de KEEP_DAYS días (solo las de este script).
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'casino-*.dump' -mtime +"$((KEEP_DAYS - 1))" -delete

echo "Copia hecha: $out ($(du -h "$out" | cut -f1)). Copias guardadas: $(find "$BACKUP_DIR" -maxdepth 1 -name 'casino-*.dump' | wc -l)"

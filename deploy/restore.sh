#!/usr/bin/env bash
# Restaura una copia de backup.sh. SUSTITUYE los datos actuales de la base de datos.
#
#   deploy/restore.sh /var/backups/rottenodds/casino-20261006T030000Z.dump
#   deploy/restore.sh --yes <archivo>     (sin pregunta, para scripts)
#
# Pasos: hace antes una copia del estado actual (por si acaso), para la API, restaura en una sola transacción
# (si algo falla no se queda a medias), vuelve a arrancar la API y espera a que esté sana.
# Mismas variables que backup.sh (ENV_FILE, BACKUP_DIR, COMPOSE_FILE).
set -euo pipefail
umask 077

REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${ENV_FILE:-/opt/rottenodds/.env.prod}
COMPOSE_FILE=${COMPOSE_FILE:-$REPO_DIR/docker-compose.prod.yml}
API_SERVICE=${API_SERVICE:-api}

yes=false
if [[ "${1:-}" == "--yes" ]]; then yes=true; shift; fi
file=${1:-}
if [[ -z "$file" || ! -f "$file" ]]; then
  echo "Uso: $0 [--yes] <archivo .dump de backup.sh>" >&2
  exit 2
fi

compose=(docker compose -f "$COMPOSE_FILE")
[[ -f "$ENV_FILE" ]] && compose+=(--env-file "$ENV_FILE")

# La copia tiene que poder leerse antes de tocar nada.
"${compose[@]}" exec -T db pg_restore --list < "$file" > /dev/null

if ! $yes; then
  echo "Se van a SUSTITUIR los datos actuales por los de: $file"
  read -r -p "Escribe «restaurar» para seguir: " answer
  [[ "$answer" == "restaurar" ]] || { echo "Cancelado."; exit 1; }
fi

echo "1/4 Copia del estado actual antes de restaurar…"
"$REPO_DIR/deploy/backup.sh"

echo "2/4 Parando la API…"
"${compose[@]}" stop "$API_SERVICE"
restart_api() { "${compose[@]}" start "$API_SERVICE" > /dev/null || true; }
trap restart_api EXIT

echo "3/4 Restaurando…"
"${compose[@]}" exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d casino --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error' < "$file"

echo "4/4 Arrancando la API…"
trap - EXIT
"${compose[@]}" start "$API_SERVICE"
container=$("${compose[@]}" ps -q "$API_SERVICE")
for _ in $(seq 1 60); do
  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")
  if [[ "$status" == "healthy" || "$status" == "running" ]]; then
    echo "Restaurado. API: $status."
    exit 0
  fi
  sleep 3
done
echo "Restaurado, pero la API no está sana todavía (estado: $status). Mira: docker compose logs $API_SERVICE" >&2
exit 1

#!/usr/bin/env bash
# Despliega la última versión de main en el VPS, o vuelve a la anterior.
#
#   deploy/deploy.sh             git pull, construir, levantar, esperar al healthcheck; si falla, vuelve atrás solo
#   deploy/deploy.sh rollback    vuelve a la versión anterior (código e imagen) a mano
#
# La copia del repositorio en el VPS es solo para desplegar (sin cambios locales): el script la mueve con
# git reset --hard. Variables: ENV_FILE (por defecto /opt/rottenodds/.env.prod).
#
# Ojo con las migraciones: Flyway solo va hacia delante. Si la versión nueva cambió el esquema, volver a la
# anterior puede no arrancar; en ese caso restaura la copia de antes del despliegue (deploy/restore.sh).
set -euo pipefail

REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${ENV_FILE:-/opt/rottenodds/.env.prod}
STATE_FILE="$REPO_DIR/.deploy-previous"
cd "$REPO_DIR"

[[ -f "$ENV_FILE" ]] || { echo "No encuentro $ENV_FILE (copia .env.prod.example fuera del repo y rellénalo)." >&2; exit 2; }
compose=(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE")
api_domain=$(grep -E '^API_DOMAIN=' "$ENV_FILE" | cut -d= -f2- || true)

wait_healthy() {
  local container status=""
  container=$("${compose[@]}" ps -q api)
  for _ in $(seq 1 60); do
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo missing)
    [[ "$status" == "healthy" ]] && return 0
    [[ "$status" == "unhealthy" || "$status" == "exited" ]] && break
    sleep 3
  done
  echo "La API no está sana (estado: $status). Últimas líneas del log:" >&2
  "${compose[@]}" logs --tail 40 api >&2 || true
  return 1
}

show_result() {
  echo
  "${compose[@]}" ps
  echo "Versión desplegada: $(git log -1 --format='%h %s')"
  if [[ -n "$api_domain" ]] && command -v curl > /dev/null; then
    echo "https://$api_domain/health → $(curl -fsS --max-time 10 "https://$api_domain/health" 2>/dev/null || echo 'sin respuesta (¿DNS o certificado todavía no listos?)')"
  fi
}

rollback() {
  [[ -f "$STATE_FILE" ]] || { echo "No hay versión anterior guardada." >&2; exit 1; }
  local prev
  prev=$(cat "$STATE_FILE")
  echo "Volviendo a $prev…"
  git reset --hard "$prev"
  if docker image inspect rottenodds-api:previous > /dev/null 2>&1; then
    docker image tag rottenodds-api:previous rottenodds-api:latest
    "${compose[@]}" up -d --no-build || true
  else
    "${compose[@]}" up -d --build || true
  fi
  "${compose[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile > /dev/null 2>&1 || true
  wait_healthy && echo "Vuelta atrás hecha." || echo "La versión anterior tampoco arranca: revisa los logs." >&2
  show_result
}

if [[ "${1:-}" == "rollback" ]]; then
  rollback
  exit 0
fi

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Hay cambios locales en $REPO_DIR: el VPS solo debe desplegar lo que está en GitHub." >&2
  exit 1
fi

prev=$(git rev-parse HEAD)
git pull --ff-only
new=$(git rev-parse HEAD)
if [[ "$prev" == "$new" ]]; then
  echo "Ya estaba en la última versión ($(git log -1 --format='%h'))."
fi

# Guardar la versión que funciona ahora, para poder volver.
echo "$prev" > "$STATE_FILE"
if docker image inspect rottenodds-api:latest > /dev/null 2>&1; then
  docker image tag rottenodds-api:latest rottenodds-api:previous
fi

"${compose[@]}" build api
# Si la API nueva no llega a estar sana, `up` falla (Caddy depende de ella): lo decide wait_healthy, no set -e.
"${compose[@]}" up -d || true
"${compose[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile > /dev/null 2>&1 || true

if wait_healthy; then
  echo "Desplegado."
  show_result
else
  echo "El despliegue no ha pasado el healthcheck: vuelvo a la versión anterior." >&2
  rollback
  exit 1
fi

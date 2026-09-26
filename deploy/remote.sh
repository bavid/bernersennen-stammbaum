#!/usr/bin/env bash
# Läuft AUF dem Server. Aufruf vom eigenen Rechner:
#   ssh root@HOST "APP_DIR=/opt/bernersennen-stammbaum bash -s -- <befehl> [arg]" < deploy/remote.sh
#
# Befehle:
#   setup          Docker installieren, Repo holen, .env mit Secrets erzeugen, starten
#   deploy         neuesten Stand holen, Image neu bauen, neu starten
#   status         Container-Status und Health-Check
#   logs           letzte 200 Log-Zeilen
#   invite         Einladungscode für neue Rudel anzeigen
#   backup         Snapshot von DB + Fotos nach $APP_DIR/backups/*.tgz
#   seed <pw>      Demo-Rudel mit Testbildern anlegen (Passwort <pw>)
#   wipe --yes     ALLE Daten löschen (DB + Fotos)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/bernersennen-stammbaum}"
REPO_URL="${REPO_URL:-https://github.com/bavid/bernersennen-stammbaum.git}"
BRANCH="${BRANCH:-main}"
HOST_PORT="${HOST_PORT:-3000}"
CONTAINER_UID=1000
COMPOSE="docker compose"

log() { printf '==> %s\n' "$*"; }
fail() { printf 'FEHLER: %s\n' "$*" >&2; exit 1; }

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return
  fi
  log "Installiere Docker (Ubuntu-Pakete)"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y -q
  apt-get install -y -q docker.io docker-compose-v2 docker-buildx git curl openssl
  systemctl enable --now docker
}

checkout() {
  mkdir -p "$APP_DIR"
  cd "$APP_DIR"
  if [ ! -d .git ]; then
    log "Klone $REPO_URL nach $APP_DIR"
    git init -q
    git remote add origin "$REPO_URL"
  fi
  git fetch -q origin "$BRANCH"
  git checkout -q -B "$BRANCH" "origin/$BRANCH"
  git reset -q --hard "origin/$BRANCH"
  log "Stand: $(git log -1 --format='%h %s')"
}

ensure_env() {
  cd "$APP_DIR"
  if [ ! -f .env ]; then
    log "Erzeuge .env mit neuen Secrets"
    (
      umask 077
      cat > .env <<EOF
JWT_SECRET=$(openssl rand -hex 32)
FAMILY_INVITE_CODE=$(openssl rand -hex 4)
COOKIE_SECURE=false
HOST_PORT=$HOST_PORT
EOF
    )
  fi
  mkdir -p data backups
  chown "$CONTAINER_UID:$CONTAINER_UID" data
}

wait_healthy() {
  for _ in $(seq 1 45); do
    if curl -fsS "http://127.0.0.1:$HOST_PORT/health" >/dev/null 2>&1; then
      log "Läuft: http://$(hostname -I | awk '{print $1}'):$HOST_PORT"
      return 0
    fi
    sleep 2
  done
  $COMPOSE logs --tail 60 || true
  fail "Health-Check nach 90 s nicht erfolgreich"
}

start() {
  cd "$APP_DIR"
  $COMPOSE up -d --build --remove-orphans
  docker image prune -f >/dev/null
  wait_healthy
}

backup() {
  cd "$APP_DIR"
  local stamp file
  stamp="$(date +%F-%H%M%S)"
  file="backups/chronik-$stamp.tgz"
  # Konsistenter Snapshot über die SQLite-Backup-API, auch während die App läuft
  $COMPOSE exec -T chronik node -e \
    "require('better-sqlite3')('/data/data.db').backup('/data/snapshot.db').then(() => process.exit(0))"
  tar czf "$file" -C data snapshot.db uploads
  rm -f data/snapshot.db
  log "Backup: $APP_DIR/$file ($(du -h "$file" | cut -f1))"
}

cmd="${1:-status}"
case "$cmd" in
  setup)
    install_docker
    checkout
    ensure_env
    start
    log "Einladungscode für neue Rudel: $(grep '^FAMILY_INVITE_CODE=' "$APP_DIR/.env" | cut -d= -f2)"
    ;;
  deploy)
    checkout
    ensure_env
    start
    ;;
  status)
    cd "$APP_DIR"
    $COMPOSE ps
    curl -fsS "http://127.0.0.1:$HOST_PORT/health" && echo
    ;;
  logs)
    cd "$APP_DIR"
    $COMPOSE logs --tail 200
    ;;
  invite)
    grep '^FAMILY_INVITE_CODE=' "$APP_DIR/.env" | cut -d= -f2
    ;;
  backup)
    backup
    ;;
  seed)
    [ -n "${2:-}" ] || fail "Passwort fehlt: seed <passwort>"
    cd "$APP_DIR"
    $COMPOSE exec -T chronik node scripts/seed.js --password "$2"
    ;;
  wipe)
    [ "${2:-}" = "--yes" ] || fail "Löscht ALLE Daten. Bestätigen mit: wipe --yes"
    cd "$APP_DIR"
    backup
    $COMPOSE stop
    rm -rf data/data.db data/data.db-wal data/data.db-shm data/uploads
    $COMPOSE start
    wait_healthy
    log "Alle Daten gelöscht (Backup liegt in backups/)"
    ;;
  *)
    fail "Unbekannter Befehl: $cmd"
    ;;
esac

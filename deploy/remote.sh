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
#
# Die App lauscht nur auf 127.0.0.1:$HTTPS_PORT. HTTPS nach außen (Let's Encrypt, Port 80 für die
# Zertifikatsprüfung) macht der gemeinsame Caddy des Servers in /opt/proxy (Repo "server").
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/bernersennen-stammbaum}"
REPO_URL="${REPO_URL:-https://github.com/bavid/bernersennen-stammbaum.git}"
BRANCH="${BRANCH:-main}"
HTTPS_PORT="${HTTPS_PORT:-3010}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-}"
CONTAINER_UID=1000
COMPOSE="docker compose"

log() { printf '==> %s\n' "$*"; }
warn() { printf 'WARNUNG: %s\n' "$*" >&2; }
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

default_public_host() {
  if [ -n "$DEPLOY_DOMAIN" ]; then
    echo "$DEPLOY_DOMAIN"
  else
    hostname -I | awk '{print $1}'
  fi
}

site_url() {
  echo "https://$(env_value PUBLIC_HOST):$(env_value HTTPS_PORT)"
}

# Setzt KEY=VALUE in .env, falls KEY noch fehlt (bestehende Werte bleiben unangetastet)
env_default() {
  grep -q "^$1=" .env || printf '%s=%s\n' "$1" "$2" >> .env
}

env_value() {
  grep "^$1=" "$APP_DIR/.env" | cut -d= -f2-
}

ensure_env() {
  cd "$APP_DIR"
  (
    umask 077
    touch .env
    env_default JWT_SECRET "$(openssl rand -hex 32)"
    env_default FAMILY_INVITE_CODE "$(openssl rand -hex 4)"
    env_default PUBLIC_HOST "$(default_public_host)"
    env_default HTTPS_PORT "$HTTPS_PORT"
    env_default COOKIE_SECURE true
    env_default TRUST_PROXY 1
  )
  chmod 600 .env
  mkdir -p data backups
  chown "$CONTAINER_UID:$CONTAINER_UID" data
}

wait_healthy() {
  cd "$APP_DIR"
  local ok=''
  for _ in $(seq 1 45); do
    if $COMPOSE exec -T chronik wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 2
  done
  if [ -z "$ok" ]; then
    $COMPOSE logs --tail 60 chronik || true
    fail "App antwortet nach 90 s nicht"
  fi

  # Erstes Zertifikat kann ein paar Sekunden dauern
  local site
  site="$(site_url)"
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 "$site/health" >/dev/null 2>&1; then
      log "Läuft mit gültigem HTTPS-Zertifikat: $site"
      return 0
    fi
    sleep 3
  done
  warn "App läuft, aber $site ist (noch) nicht per HTTPS erreichbar. Läuft der Server-Proxy? (cd /opt/proxy && docker compose logs --tail 40)"
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
    log "Einladungscode für neue Rudel: $(env_value FAMILY_INVITE_CODE)"
    ;;
  deploy)
    checkout
    ensure_env
    start
    ;;
  status)
    cd "$APP_DIR"
    $COMPOSE ps
    curl -fsS --max-time 5 "$(site_url)/health" && echo
    ;;
  logs)
    cd "$APP_DIR"
    $COMPOSE logs --tail 200
    ;;
  invite)
    env_value FAMILY_INVITE_CODE
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
    $COMPOSE stop chronik
    rm -rf data/data.db data/data.db-wal data/data.db-shm data/uploads
    $COMPOSE start chronik
    wait_healthy
    log "Alle Daten gelöscht (Backup liegt in backups/)"
    ;;
  *)
    fail "Unbekannter Befehl: $cmd"
    ;;
esac

#!/usr/bin/env bash
# Läuft AUF dem Server. Aufruf vom eigenen Rechner:
#   ssh root@HOST "APP_DIR=/opt/bernersennen-stammbaum bash -s -- <befehl> [arg]" < deploy/remote.sh
#
# Befehle:
#   setup          Docker installieren, Repo holen, .env mit Secrets erzeugen, starten
#   deploy         neuesten Stand holen (oder REVISION=<sha>), vorher Backup, Image neu bauen, neu starten
#   status         Container-Status und Health-Check
#   logs           letzte 200 Log-Zeilen
#   backup         Snapshot von DB + Fotos nach $APP_DIR/backups/*.tgz
#   demo           öffentliche Demo (neu) anlegen – ersetzt nur das Demo-Rudel, echte Rudel bleiben
#   showcase       NUR Vorschau/Staging: alle Daten löschen und Beispieldaten neu anlegen (vorher Backup)
#   wipe --yes     ALLE Daten löschen (DB + Fotos)
#   admin <hash>   Admin-Zugang setzen (Hash von `npm run admin:hash`), Benutzer "admin"
#
# Variablen für eine zweite Instanz (Vorschau), z. B.:
#   APP_DIR=/opt/bernersennen-stammbaum-staging BRANCH=staging HTTPS_PORT=3005 \
#   CONTAINER_NAME=fap-preview IMAGE_TAG=staging APP_ENV=staging bash -s -- setup
# REVISION=<volles SHA> deployt genau diesen Stand (z. B. das auf der Vorschau getestete SHA nach Prod).
#
# Die App lauscht nur auf 127.0.0.1:$HTTPS_PORT. HTTPS nach außen (Let's Encrypt, Port 80 für die
# Zertifikatsprüfung) macht der gemeinsame Caddy des Servers in /opt/proxy (Repo "server").
set -euo pipefail

# Für check_instance: was hat der Aufrufer tatsächlich übergeben? Vor den Defaults unten festhalten,
# sonst ist nicht mehr unterscheidbar "explizit gesetzt" von "Default getroffen".
ARG_APP_ENV="${APP_ENV:-}"
ARG_CONTAINER_NAME="${CONTAINER_NAME:-}"
ARG_IMAGE_TAG="${IMAGE_TAG:-}"
ARG_HTTPS_PORT="${HTTPS_PORT:-}"

APP_DIR="${APP_DIR:-/opt/bernersennen-stammbaum}"
REPO_URL="${REPO_URL:-https://github.com/bavid/bernersennen-stammbaum.git}"
BRANCH="${BRANCH:-main}"
HTTPS_PORT="${HTTPS_PORT:-3010}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-}"
REVISION="${REVISION:-}"
APP_ENV="${APP_ENV:-production}"
CONTAINER_NAME="${CONTAINER_NAME:-bernersennen-stammbaum}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
CONTAINER_UID=1000
COMPOSE="docker compose"
readonly BACKUP_KEEP=10

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
  local target="origin/$BRANCH"
  if [ -n "$REVISION" ]; then
    git cat-file -e "$REVISION^{commit}" 2>/dev/null || git fetch -q origin "$REVISION" || fail "Stand $REVISION nicht gefunden"
    target="$REVISION"
  fi
  # Ohne explizites REVISION nie stillschweigend zurückspringen (z. B. History-Rewrite auf GitHub)
  if [ -z "$REVISION" ]; then
    if git rev-parse -q --verify HEAD >/dev/null && ! git merge-base --is-ancestor HEAD "$target"; then
      fail "Der laufende Stand $(git rev-parse --short HEAD) ist nicht in $target enthalten – zurück auf einen älteren Stand oder falscher BRANCH? Mit REVISION=<volles SHA> gezielt deployen oder erst $BRANCH auf GitHub vorspulen."
    fi
  fi
  git checkout -q -B "$BRANCH" "$target"
  git reset -q --hard "$target"
  log "Stand: $(git log -1 --format='%H %s')"
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

# Schützt vor Instanz-Verwechslung: wenn $APP_DIR schon eine .env hat, muss jeder explizit
# übergebene Wert (APP_ENV/CONTAINER_NAME/IMAGE_TAG/HTTPS_PORT) zu dem passen, was dort schon steht.
check_instance() {
  [ -f "$APP_DIR/.env" ] || return 0
  local key var arg existing def
  for key in APP_ENV CONTAINER_NAME IMAGE_TAG HTTPS_PORT; do
    var="ARG_$key"
    arg="${!var}"
    [ -n "$arg" ] || continue
    # Fehlt der Schlüssel noch in .env (z. B. Instanz vor diesem Feature angelegt), gilt der
    # historische Standardwert – env_value schlägt sonst unter set -e/pipefail fehl (grep ohne Treffer)
    def=""
    case "$key" in
      APP_ENV) def=production ;;
      CONTAINER_NAME) def=bernersennen-stammbaum ;;
      IMAGE_TAG) def=latest ;;
      HTTPS_PORT) def=3010 ;;
    esac
    existing="$(env_value "$key" || true)"
    existing="${existing:-$def}"
    [ -n "$existing" ] || continue
    if [ "$arg" != "$existing" ]; then
      fail "$APP_DIR ist die Instanz mit $key=$existing, übergeben wurde $key=$arg – falsches APP_DIR?"
    fi
  done
}

ensure_env() {
  cd "$APP_DIR"
  (
    umask 077
    touch .env
    env_default JWT_SECRET "$(openssl rand -hex 32)"
    # Nie erneut setzen, sobald einmal vergeben - siehe .env.example: bestehende Gutschein-Codes
    # werden sonst wertlos. env_default überschreibt einen schon vorhandenen Wert ohnehin nie.
    env_default CODE_PEPPER "$(openssl rand -hex 32)"
    env_default PUBLIC_HOST "$(default_public_host)"
    env_default HTTPS_PORT "$HTTPS_PORT"
    env_default COOKIE_SECURE true
    env_default TRUST_PROXY 1
    env_default APP_ENV "$APP_ENV"
    env_default CONTAINER_NAME "$CONTAINER_NAME"
    env_default IMAGE_TAG "$IMAGE_TAG"
    env_default COMPOSE_PROJECT_NAME "$(basename "$APP_DIR")"
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
  # .env gehört dazu: ohne die Secrets (JWT_SECRET, CODE_PEPPER) sind Sessions und Gutschein-Codes wertlos.
  # partner-media (Partner-Logos, Phase 2) gibt es erst seit es Partner gibt - auf älteren/partnerlosen
  # Instanzen fehlt das Verzeichnis, tar würde dort sonst mit "No such file or directory" abbrechen.
  local tar_args=(-C data snapshot.db uploads)
  [ -d data/partner-media ] && tar_args+=(partner-media)
  tar_args+=(-C "$APP_DIR" .env)
  (umask 077 && tar czf "$file" "${tar_args[@]}")
  rm -f data/snapshot.db
  log "Backup: $APP_DIR/$file ($(du -h "$file" | cut -f1))"
  # Nur die letzten $BACKUP_KEEP Archive dieser Instanz behalten
  ls -1t backups/chronik-*.tgz 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | xargs -r rm --
}

# Vor Deploys sichern – Migrationen lassen sich nicht zurückdrehen. Beim allerersten Start gibt es noch nichts.
backup_if_running() {
  [ -d "$APP_DIR" ] || return 0
  cd "$APP_DIR"
  if [ -f .env ] && $COMPOSE ps --status running -q chronik 2>/dev/null | grep -q .; then
    backup
  else
    log "Kein Backup: App läuft (noch) nicht"
  fi
}

cmd="${1:-status}"
# Schützt vor Instanz-Verwechslung bei JEDEM Befehl (nicht nur setup/deploy/showcase) - lesend, kehrt
# ohne .env sofort zurück.
check_instance
case "$cmd" in
  setup)
    install_docker
    checkout
    ensure_env
    start
    ;;
  deploy)
    backup_if_running
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
  backup)
    backup
    ;;
  demo)
    cd "$APP_DIR"
    backup
    $COMPOSE exec -T chronik node scripts/demo.js
    ;;
  showcase)
    cd "$APP_DIR"
    case "$(env_value APP_ENV)" in
      staging|dev) ;;
      *) fail "showcase setzt alle Daten zurück – nur für Vorschau/Staging (APP_ENV=staging in .env)" ;;
    esac
    backup
    $COMPOSE exec -T chronik node scripts/testenv-seed.js --reset
    ;;
  admin)
    [[ "${2:-}" =~ ^scrypt:[0-9a-f]+:[0-9a-f]+$ ]] || fail "Hash fehlt oder ist ungültig: admin <scrypt:…>"
    cd "$APP_DIR"
    env_default ADMIN_USERNAME admin
    if grep -q '^ADMIN_PASSWORD_HASH=' .env; then
      sed -i "s|^ADMIN_PASSWORD_HASH=.*|ADMIN_PASSWORD_HASH=$2|" .env
    else
      printf 'ADMIN_PASSWORD_HASH=%s\n' "$2" >> .env
    fi
    $COMPOSE up -d chronik
    wait_healthy
    log "Admin-Zugang gesetzt: $(site_url)/admin (Benutzer: $(env_value ADMIN_USERNAME))"
    ;;
  wipe)
    [ "${2:-}" = "--yes" ] || fail "Löscht ALLE Daten. Bestätigen mit: wipe --yes"
    cd "$APP_DIR"
    backup
    $COMPOSE stop chronik
    rm -rf data/data.db data/data.db-wal data/data.db-shm data/uploads data/partner-media
    $COMPOSE start chronik
    wait_healthy
    log "Alle Daten gelöscht (Backup liegt in backups/)"
    ;;
  *)
    fail "Unbekannter Befehl: $cmd"
    ;;
esac

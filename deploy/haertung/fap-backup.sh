#!/usr/bin/env bash
# /usr/local/bin/fap-backup.sh - Sicherung außer Haus: Datenbank-Schnappschuss, Fotos, Partner-Bilder und die .env jeder
# App-Instanz verschlüsselt mit restic auf die Hetzner Storage Box (SFTP, Port 23). Installiert von
# deploy/haertung/06-restic.sh, läuft täglich 03:50 über fap-backup.timer (nach der App-Sicherung 03:30, vor dem
# Update-Neustart 04:00) - oder von Hand. Steht allein (ohne lib.sh), weil es nach /usr/local/bin kopiert wird.
# Einstellungen: /etc/fap-backup/common.env (Storage Box, Schlüssel) und je Instanz /etc/fap-backup/<name>.env
# (APP_DIR, REPO_PATH) + <name>.pass (restic-Passwort, nur root lesbar). Ins Journal kommen nie Passwörter.
# Datenbank: die jüngste auto-*.db der App (server/lib/autoBackup.js), wenn sie frisch ist (< 26 h), sonst ein eigener
# Schnappschuss mit `sqlite3 .backup` (konsistent, auch während die App läuft); danach PRAGMA quick_check.
# Markierung <daten>/backups/last-offsite-backup.json { at, bytes, kind: "offsite" } für den Admin-Reiter „Server“ -
# als neue Datei im Ordner + rename geschrieben (folgt nie einem symbolischen Link), Besitzer = Besitzer des Ordners.
# Die Funktionen laden 06-restic.sh, 07-restore-test.sh und check.sh mit FAP_BACKUP_SOURCE_ONLY=1 (nichts läuft dann).
set -euo pipefail

CONF_DIR="${FAP_BACKUP_CONF:-/etc/fap-backup}"
STATE_DIR="${FAP_BACKUP_STATE:-/var/lib/fap-backup}"
FRESH_AUTO_SECONDS=$((26 * 3600))
OFFSITE_MARKER=last-offsite-backup.json
CHECK="${CHECK:-0}"

log() { printf '==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf 'WARNUNG: %s\n' "$*" >&2; }
fail() { printf 'FEHLER: %s\n' "$*" >&2; exit 1; }
heading() { printf '\n--- %s ---\n' "$*"; }

usage() {
  cat <<'EOF'
Aufruf: fap-backup.sh [--check] [--instance NAME] [--init]
  --check          zeigen, was gesichert würde, und die Verbindung zur Storage Box prüfen - nichts sichern
  --instance NAME  nur diese Instanz (Name = Datei /etc/fap-backup/NAME.env)
  --init           fehlende restic-Repositories anlegen (macht 06-restic.sh), danach beenden
EOF
}

# --- Einstellungen ---------------------------------------------------------------------------------------------

fb_load_common() {
  [ -f "$CONF_DIR/common.env" ] || fail "$CONF_DIR/common.env fehlt - zuerst deploy/haertung/06-restic.sh ausführen"
  # shellcheck disable=SC1091
  set -a && source "$CONF_DIR/common.env" && set +a
  : "${STORAGEBOX_USER:?STORAGEBOX_USER fehlt in common.env}" "${STORAGEBOX_HOST:?STORAGEBOX_HOST fehlt in common.env}"
  STORAGEBOX_PORT="${STORAGEBOX_PORT:-23}"
  SSH_KEY="${SSH_KEY:-$CONF_DIR/id_ed25519}"
  KNOWN_HOSTS="${KNOWN_HOSTS:-$CONF_DIR/known_hosts}"
  command -v restic >/dev/null 2>&1 || fail "restic fehlt (06-restic.sh)"
  command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 fehlt (06-restic.sh)"
  [ -f "$SSH_KEY" ] || fail "SSH-Schlüssel $SSH_KEY fehlt (06-restic.sh)"
  # restic spricht SFTP über genau diesen ssh-Aufruf: Port 23 der Storage Box, nur unser Schlüssel, bekannter Host-Schlüssel.
  SFTP_CMD="ssh -p $STORAGEBOX_PORT -i $SSH_KEY -o BatchMode=yes -o IdentitiesOnly=yes -o UserKnownHostsFile=$KNOWN_HOSTS -o StrictHostKeyChecking=yes -o ConnectTimeout=20 $STORAGEBOX_USER@$STORAGEBOX_HOST -s sftp"
}

# Namen aller eingerichteten Instanzen (Dateien <name>.env außer common.env).
fb_instances() {
  local file name
  for file in "$CONF_DIR"/*.env; do
    [ -f "$file" ] || continue
    name="$(basename "$file" .env)"
    [ "$name" = common ] || printf '%s\n' "$name"
  done
  return 0
}

# Setzt APP_DIR, REPO_PATH, PASS_FILE, STAGE und DATA für eine Instanz und prüft die Passwortdatei (600, root).
fb_load_instance() {
  local name="$1" file="$CONF_DIR/$1.env"
  [[ "$name" =~ ^[a-z][a-z0-9-]{0,31}$ ]] || fail "Ungültiger Instanzname: $name"
  [ -f "$file" ] || fail "$file fehlt"
  unset APP_DIR REPO_PATH
  # shellcheck disable=SC1090
  set -a && source "$file" && set +a
  : "${APP_DIR:?APP_DIR fehlt in $file}" "${REPO_PATH:?REPO_PATH fehlt in $file}"
  INSTANCE="$name"
  PASS_FILE="$CONF_DIR/$name.pass"
  STAGE="$STATE_DIR/$name"
  DATA="$APP_DIR/data"
  if [ -f "$PASS_FILE" ] && [ "$(stat -c '%a:%U' "$PASS_FILE")" != "600:root" ]; then
    fail "$PASS_FILE muss root gehören und 600 haben (chown root:root, chmod 600)"
  fi
}

# restic für die geladene Instanz - Repository und Passwort kommen aus den Einstellungen, der Rest sind die Argumente.
fb_restic() {
  [ -s "$PASS_FILE" ] || fail "$PASS_FILE fehlt oder ist leer"
  restic -o "sftp.command=$SFTP_CMD" -r "sftp::$REPO_PATH" --password-file "$PASS_FILE" "$@"
}

# --- Markierungen ----------------------------------------------------------------------------------------------

json_num() { printf '%s' "$2" | grep -oE "\"$1\":[0-9]+" | head -n1 | cut -d: -f2; }
json_str() { printf '%s' "$2" | grep -oE "\"$1\":\"[^\"]*\"" | head -n1 | cut -d'"' -f4; }

# Schreibt $2 als Datei $1/last-offsite-backup.json: neue Datei (mktemp, folgt keinem Link), Besitzer wie der Ordner,
# dann rename (ersetzt auch einen untergeschobenen Link, mv -T wechselt nie in einen Ordner). Ordner selbst kein Link.
fb_write_marker() {
  local dir="$1" content="$2" owner tmp
  if [ ! -d "$dir" ] || [ -L "$dir" ]; then
    warn "Markierung nicht geschrieben: $dir fehlt oder ist ein symbolischer Link"
    return 1
  fi
  owner="$(stat -c '%u:%g' "$dir")"
  tmp="$(mktemp "$dir/.last-offsite-backup.XXXXXX")"
  printf '%s\n' "$content" >"$tmp"
  chown "$owner" "$tmp"
  chmod 600 "$tmp"
  mv -f -T "$tmp" "$dir/$OFFSITE_MARKER"
}

# Zustand des letzten Laufs für check.sh (nur auf dem Server, root): ok, Zeit, Schnappschuss, Größe.
fb_write_state() {
  local stage="$1" ok="$2" snapshot="${3:-}" bytes="${4:-0}" quelle="${5:-}"
  install -d -m 700 "$stage"
  printf '{"at":"%s","ok":%s,"snapshot":"%s","bytes":%s,"quelle":"%s"}\n' \
    "$(date -u +%FT%TZ)" "$ok" "$snapshot" "$bytes" "$quelle" >"$stage/last-run.json.tmp"
  mv -f -T "$stage/last-run.json.tmp" "$stage/last-run.json"
}

# --- Sicherung einer Instanz ------------------------------------------------------------------------------------

# Datenbank-Schnappschuss nach $STAGE/data.db: jüngste frische auto-*.db der App oder eigener sqlite3-.backup.
fb_stage_database() {
  local newest age=0
  newest="$(find "$DATA/backups" -maxdepth 1 -name 'auto-????-??-??.db' -type f 2>/dev/null | sort | tail -n1 || true)"
  if [ -n "$newest" ]; then
    age=$(($(date +%s) - $(stat -c %Y "$newest")))
  fi
  if [ -n "$newest" ] && [ "$age" -lt "$FRESH_AUTO_SECONDS" ]; then
    QUELLE="app:$(basename "$newest")"
    info "Datenbank: App-Sicherung $(basename "$newest") ($((age / 3600)) h alt)"
    [ "$CHECK" = 1 ] || cp -f "$newest" "$STAGE/data.db.tmp"
  else
    QUELLE="sqlite3-backup"
    [ -f "$DATA/data.db" ] || fail "$DATA/data.db fehlt"
    info "Datenbank: eigener Schnappschuss von data.db (keine frische App-Sicherung)"
    [ "$CHECK" = 1 ] || sqlite3 "$DATA/data.db" ".backup '$STAGE/data.db.tmp'"
  fi
  [ "$CHECK" = 1 ] && return 0
  local result
  result="$(sqlite3 "$STAGE/data.db.tmp" 'PRAGMA quick_check;' | head -n1)"
  [ "$result" = ok ] || { rm -f "$STAGE/data.db.tmp"; fail "Schnappschuss der Datenbank ist beschädigt (quick_check: $result)"; }
  chmod 600 "$STAGE/data.db.tmp"
  mv -f -T "$STAGE/data.db.tmp" "$STAGE/data.db"
}

fb_backup_instance() {
  fb_load_instance "$1"
  heading "Instanz $INSTANCE ($APP_DIR)"
  if [ ! -d "$DATA" ] || [ -L "$DATA" ]; then
    fail "$DATA fehlt oder ist ein symbolischer Link"
  fi
  install -d -m 700 "$STAGE"
  fb_stage_database
  if [ -f "$APP_DIR/.env" ]; then
    # Ohne JWT_SECRET und CODE_PEPPER wären Sitzungen und Gutschein-Codes nach einer Wiederherstellung wertlos.
    [ "$CHECK" = 1 ] || { cp -f "$APP_DIR/.env" "$STAGE/app.env" && chmod 600 "$STAGE/app.env"; }
  else
    warn ".env der Instanz fehlt - wird nicht gesichert"
  fi
  local paths=("$STAGE") dir
  for dir in uploads partner-media; do
    [ -d "$DATA/$dir" ] && paths+=("$DATA/$dir")
  done
  info "Gesichert wird: $(du -shc "${paths[@]}" 2>/dev/null | tail -n1 | cut -f1) in ${#paths[@]} Pfaden (Schnappschuss, .env, Fotos, Partner-Bilder)"

  if [ "$CHECK" = 1 ]; then
    info "Verbindung zur Storage Box und jüngster Schnappschuss:"
    fb_restic snapshots --host "fap-$INSTANCE" --latest 1 --compact 2>&1 | sed 's/^/      /' || warn "Repository nicht erreichbar oder noch nicht angelegt (06-restic.sh)"
    return 0
  fi

  local out summary snapshot bytes
  # --json: die letzte Zeile „summary“ liefert Schnappschuss-ID und Größe. Ausgabe nur zusammengefasst ins Journal.
  out="$(fb_restic backup --host "fap-$INSTANCE" --tag fap --one-file-system --exclude '*.tmp' --exclude 'snapshot.db' --json "${paths[@]}")"
  summary="$(printf '%s\n' "$out" | grep '"message_type":"summary"' | tail -n1)"
  [ -n "$summary" ] || fail "restic hat keine Zusammenfassung geliefert"
  snapshot="$(json_str snapshot_id "$summary" | cut -c1-8)"
  bytes="$(json_num total_bytes_processed "$summary")"
  log "Schnappschuss $snapshot: $((bytes / 1024 / 1024)) MB erfasst, $(json_num files_new "$summary") neue und $(json_num files_changed "$summary") geänderte Dateien, $(($(json_num data_added "$summary") / 1024)) KB neu übertragen"
  fb_write_state "$STAGE" true "$snapshot" "$bytes" "$QUELLE"
  fb_write_marker "$DATA/backups" "{\"at\":\"$(date -u +%FT%T.000Z)\",\"bytes\":$bytes,\"kind\":\"offsite\"}" \
    || warn "Markierung für den Admin-Reiter nicht geschrieben"
}

# Repositories anlegen, die es noch nicht gibt (06-restic.sh, --init). Fehlt der Schlüssel auf der Storage Box, nur Warnung.
fb_init_repos() {
  local name
  while IFS= read -r name; do
    fb_load_instance "$name"
    if fb_restic cat config >/dev/null 2>&1; then
      info "Repository für $name ist angelegt"
    elif [ "$CHECK" = 1 ]; then
      info "würde: Repository für $name anlegen (restic init, sftp::$REPO_PATH)"
    elif fb_restic init 2>&1 | sed 's/^/      /'; then
      log "Repository für $name angelegt"
    else
      warn "Repository für $name ließ sich nicht anlegen - Schlüssel auf der Storage Box eingetragen? (README, Block 6)"
    fi
  done < <(fb_instances)
}

# Nur Funktionen laden (06-restic.sh, 07-restore-test.sh, check.sh, Tests) - nichts ausführen.
if [ "${FAP_BACKUP_SOURCE_ONLY:-}" = 1 ]; then
  return 0 2>/dev/null || exit 0
fi

ONLY=""
INIT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1 ;;
    --init) INIT=1 ;;
    --instance) ONLY="${2:-}"; shift ;;
    -h | --help) usage; exit 0 ;;
    *) fail "Unbekannte Option: $1" ;;
  esac
  shift
done
[ "$(id -u)" -eq 0 ] || fail "Bitte als root ausführen (sudo fap-backup.sh …)"
[ "$CHECK" = 1 ] && log "Prüfmodus (--check): nichts wird gesichert."
fb_load_common
install -d -m 700 "$STATE_DIR"

if [ "$INIT" = 1 ]; then
  fb_init_repos
  exit 0
fi

# Nie zwei Läufe gleichzeitig (Timer + Hand).
exec 9>"$STATE_DIR/.lock"
flock -n 9 || fail "Eine Sicherung läuft bereits"

names=()
while IFS= read -r name; do
  [ -z "$ONLY" ] || [ "$name" = "$ONLY" ] || continue
  names+=("$name")
done < <(fb_instances)
[ "${#names[@]}" -gt 0 ] || fail "Keine Instanz eingerichtet${ONLY:+ (oder $ONLY unbekannt)} - 06-restic.sh"

rc=0
for name in "${names[@]}"; do
  # Fehler einer Instanz halten die anderen nicht auf: Subshell mit eigenem set -e, danach der Status.
  set +e
  (
    set -e
    fb_backup_instance "$name"
  )
  status=$?
  set -e
  if [ "$status" -ne 0 ]; then
    warn "Instanz $name: Sicherung fehlgeschlagen (Status $status)"
    fb_write_state "$STATE_DIR/$name" false "" 0 "fehler"
    rc=1
  fi
done
exit "$rc"

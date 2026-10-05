#!/usr/bin/env bash
# Block 7 - Wiederherstellungs-Probe: den jüngsten Schnappschuss einer Instanz (Standard: prod) aus der Storage Box in
# einen Temp-Ordner unter /var/lib/fap-backup holen - nur die Datenbank, Fotos auf Wunsch mit --mit-fotos -, dann
# PRAGMA integrity_check, Tabellen zählen und das Ergebnis nach /var/lib/fap-backup/<name>/last-restore-test.json
# schreiben (zeigt check.sh). Der Temp-Ordner wird danach gelöscht, außer mit --keep (zum Laden in die Vorschau, README).
# An den laufenden Instanzen ändert sich nichts. Einmal im Monat laufen lassen. --check zeigt nur die Schnappschüsse.
set -euo pipefail
HAERTUNG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HAERTUNG_DIR/lib.sh"

usage() {
  cat <<'EOF'
Aufruf: 07-restore-test.sh [--check] [--instance prod] [--keep] [--mit-fotos]
  --instance NAME  Instanz (Standard prod; Namen = /etc/fap-backup/<name>.env)
  --keep           Temp-Ordner stehen lassen (Pfad wird gezeigt) - etwa zum Laden in die Vorschau
  --mit-fotos      auch Fotos und Partner-Bilder zurückholen (dauert, braucht Platz)
EOF
}
INSTANCE_NAME=prod
KEEP=0
WITH_PHOTOS=0
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --instance) INSTANCE_NAME="${2:-}"; shift ;;
    --keep) KEEP=1 ;;
    --mit-fotos) WITH_PHOTOS=1 ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done
EXTRA_FLAGS="--instance NAME, --keep, --mit-fotos"
parse_flags "${ARGS[@]+"${ARGS[@]}"}"
need_root

BACKUP_BIN=/usr/local/bin/fap-backup.sh
[ -f "$BACKUP_BIN" ] || BACKUP_BIN="$HAERTUNG_DIR/fap-backup.sh"
# shellcheck source=fap-backup.sh
FAP_BACKUP_SOURCE_ONLY=1 source "$BACKUP_BIN"
fb_load_common
fb_load_instance "$INSTANCE_NAME"

heading "Schnappschüsse von $INSTANCE_NAME (jüngste zuerst)"
fb_restic snapshots --host "fap-$INSTANCE" --latest 5 --compact | sed 's/^/    /'
[ "$CHECK" = 1 ] && { info "Prüfmodus - keine Wiederherstellung."; exit 0; }

TARGET="$(mktemp -d "$STATE_DIR/restore-$INSTANCE-XXXXXX")"
chmod 700 "$TARGET"
cleanup() {
  if [ "$KEEP" = 1 ]; then
    info "Temp-Ordner bleibt: $TARGET (löschen mit: rm -rf $TARGET)"
  else
    rm -rf "$TARGET"
  fi
}
trap cleanup EXIT

heading "Wiederherstellen nach $TARGET"
includes=(--include "$STAGE/data.db" --include "$STAGE/app.env")
if [ "$WITH_PHOTOS" = 1 ]; then
  includes+=(--include "$DATA/uploads" --include "$DATA/partner-media")
fi
fb_restic restore latest --host "fap-$INSTANCE" --target "$TARGET" "${includes[@]}" 2>&1 | tail -n 5 | sed 's/^/    /'
DB="$TARGET$STAGE/data.db"
[ -f "$DB" ] || { fb_write_state "$STAGE" false "" 0 "restore-test:keine-db"; fail "Im Schnappschuss liegt keine Datenbank ($STAGE/data.db)"; }

heading "Prüfung"
integrity="$(sqlite3 "$DB" 'PRAGMA integrity_check;' | head -n 3)"
tables="$(sqlite3 "$DB" "SELECT count(*) FROM sqlite_master WHERE type='table';")"
bytes="$(stat -c %s "$DB")"
info "Datenbank: $((bytes / 1024)) KB, $tables Tabellen"
info "integrity_check: $integrity"
[ -f "$TARGET$STAGE/app.env" ] && info ".env: vorhanden ($(grep -c . "$TARGET$STAGE/app.env") Zeilen, nicht angezeigt)"
if [ "$WITH_PHOTOS" = 1 ]; then
  info "Fotos: $(find "$TARGET$DATA/uploads" -type f 2>/dev/null | wc -l) Dateien, Partner-Bilder: $(find "$TARGET$DATA/partner-media" -type f 2>/dev/null | wc -l) Dateien"
fi

ok_json=false
[ "$integrity" = ok ] && [ "$tables" -gt 0 ] && ok_json=true
printf '{"at":"%s","ok":%s,"tables":%s,"bytes":%s,"integrity":"%s"}\n' \
  "$(date -u +%FT%TZ)" "$ok_json" "$tables" "$bytes" "$(printf '%s' "$integrity" | head -n1 | tr -d '"')" >"$STAGE/last-restore-test.json.tmp"
mv -f -T "$STAGE/last-restore-test.json.tmp" "$STAGE/last-restore-test.json"

if [ "$ok_json" = true ]; then
  log "Wiederherstellung von $INSTANCE geprüft: in Ordnung"
else
  fail "Wiederherstellung von $INSTANCE: Datenbank NICHT in Ordnung - Sicherung prüfen (restic check), ältere Schnappschüsse probieren"
fi
[ "$KEEP" = 1 ] && info "In die Vorschau laden: README, Block 7."

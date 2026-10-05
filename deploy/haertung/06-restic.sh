#!/usr/bin/env bash
# Block 6 - Sicherung außer Haus einrichten: restic und sqlite3 installieren, unter /etc/fap-backup (nur root) einen
# SSH-Schlüssel für die Storage Box, die Zugangsdaten (common.env), je App-Instanz Einstellungen (<name>.env) und ein
# zufälliges restic-Passwort (<name>.pass, EINMAL angezeigt - in den Passwort-Manager!), die Repositories auf der Storage
# Box anlegen, fap-backup.sh nach /usr/local/bin kopieren und den Timer 03:50 Uhr einschalten.
# Die Storage Box (Hetzner, BX11) muss vorher bestellt und ein Sub-Account mit SSH-Zugang angelegt sein - der öffentliche
# Schlüssel, den dieses Skript zeigt, gehört dort hinein (README, Block 6). Aufbewahrung (forget/prune) läuft bewusst
# NICHT auf dem Server, sondern vom Rechner des Betreibers (README). --check zeigt nur.
set -euo pipefail
HAERTUNG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HAERTUNG_DIR/lib.sh"

usage() {
  cat <<'EOF'
Aufruf: 06-restic.sh [--check]
  STORAGEBOX_USER=uXXXXXX-sub1               Sub-Account der Storage Box (Pflicht beim ersten Lauf)
  STORAGEBOX_HOST=uXXXXXX.your-storagebox.de  Adresse der Storage Box (Pflicht beim ersten Lauf)
  STORAGEBOX_PORT=23                          SFTP-Port der Storage Box
  FAP_INSTANCES=…                             App-Instanzen (siehe lib.sh), je eine wird ein Repository
EOF
}
parse_flags "$@"
need_root
export DEBIAN_FRONTEND=noninteractive

CONF_DIR=/etc/fap-backup
STATE_DIR=/var/lib/fap-backup
SSH_KEY="$CONF_DIR/id_ed25519"
KNOWN_HOSTS="$CONF_DIR/known_hosts"
BACKUP_BIN=/usr/local/bin/fap-backup.sh
STORAGEBOX_PORT="${STORAGEBOX_PORT:-23}"

heading "Pakete"
ensure_package restic sqlite3 openssh-client

heading "Ordner $CONF_DIR und $STATE_DIR (nur root)"
for dir in "$CONF_DIR" "$STATE_DIR"; do
  if [ -d "$dir" ] && [ "$(stat -c %a "$dir")" = 700 ]; then
    ok "$dir"
  elif apply "$dir anlegen (700)"; then
    install -d -m 700 "$dir"
  fi
done

heading "SSH-Schlüssel für die Storage Box"
if [ -f "$SSH_KEY" ]; then
  ok "$SSH_KEY vorhanden"
elif apply "Schlüsselpaar $SSH_KEY erzeugen (ed25519, ohne Passphrase - nur root lesbar)"; then
  ssh-keygen -q -t ed25519 -N '' -C fap-backup -f "$SSH_KEY"
fi
if [ -f "$SSH_KEY.pub" ]; then
  info "Öffentlicher Schlüssel - gehört in den Sub-Account der Storage Box (README, Block 6):"
  sed 's/^/      /' "$SSH_KEY.pub"
fi

heading "Zugangsdaten $CONF_DIR/common.env"
if [ -f "$CONF_DIR/common.env" ]; then
  ok "vorhanden"
  # shellcheck disable=SC1091
  set -a && source "$CONF_DIR/common.env" && set +a
else
  [ -n "${STORAGEBOX_USER:-}" ] && [ -n "${STORAGEBOX_HOST:-}" ] \
    || fail "Beim ersten Lauf STORAGEBOX_USER und STORAGEBOX_HOST angeben (Umgebung oder haertung.env)"
  [[ "$STORAGEBOX_USER" =~ ^[a-z0-9-]+$ ]] || fail "STORAGEBOX_USER sieht falsch aus"
  [[ "$STORAGEBOX_HOST" =~ ^[a-z0-9.-]+$ ]] || fail "STORAGEBOX_HOST sieht falsch aus"
  write_if_changed "$CONF_DIR/common.env" 0600 <<EOF || true
# von deploy/haertung/06-restic.sh - Zugang zur Storage Box (kein Passwort, nur der Schlüssel $SSH_KEY)
STORAGEBOX_USER=$STORAGEBOX_USER
STORAGEBOX_HOST=$STORAGEBOX_HOST
STORAGEBOX_PORT=$STORAGEBOX_PORT
EOF
fi
STORAGEBOX_USER="${STORAGEBOX_USER:-}"
STORAGEBOX_HOST="${STORAGEBOX_HOST:-}"

heading "Host-Schlüssel der Storage Box ($KNOWN_HOSTS)"
if [ -n "$STORAGEBOX_HOST" ] && [ -s "$KNOWN_HOSTS" ] && ssh-keygen -F "[$STORAGEBOX_HOST]:$STORAGEBOX_PORT" -f "$KNOWN_HOSTS" >/dev/null 2>&1; then
  ok "bekannt"
elif [ -z "$STORAGEBOX_HOST" ]; then
  info "ohne STORAGEBOX_HOST nichts zu tun (Prüfmodus)"
elif apply "Host-Schlüssel per ssh-keyscan holen und eintragen (Fingerabdruck mit der Hetzner-Doku vergleichen!)"; then
  scanned="$(ssh-keyscan -p "$STORAGEBOX_PORT" -t ed25519,rsa "$STORAGEBOX_HOST" 2>/dev/null)" || fail "ssh-keyscan fehlgeschlagen (Netz? Host?)"
  [ -n "$scanned" ] || fail "ssh-keyscan lieferte nichts - Storage Box nicht erreichbar oder SSH-Zugang dort nicht aktiv"
  info "Fingerabdrücke:"
  printf '%s\n' "$scanned" | ssh-keygen -lf - | sed 's/^/      /'
  (umask 077 && printf '%s\n' "$scanned" >>"$KNOWN_HOSTS")
fi

heading "Instanzen"
while IFS='|' read -r name dir; do
  [ -n "$dir" ] || continue
  write_if_changed "$CONF_DIR/$name.env" 0600 <<EOF || true
# von deploy/haertung/06-restic.sh - Instanz $name
APP_DIR=$dir
REPO_PATH=/$name
EOF
  pass="$CONF_DIR/$name.pass"
  if [ -s "$pass" ]; then
    ok "restic-Passwort für $name ist gesetzt ($pass)"
  elif apply "zufälliges restic-Passwort für $name erzeugen und EINMAL anzeigen"; then
    secret="$(openssl rand -base64 32 | tr -d '\n')"
    (umask 077 && printf '%s\n' "$secret" >"$pass")
    printf '\n    *** restic-Passwort %s: %s ***\n    Jetzt in den Passwort-Manager - ohne dieses Passwort sind die Sicherungen wertlos.\n\n' "$name" "$secret"
    unset secret
  fi
done < <(fap_instances)

heading "Sicherungs-Skript $BACKUP_BIN"
write_if_changed "$BACKUP_BIN" 0755 <"$HAERTUNG_DIR/fap-backup.sh" || true

heading "Repositories auf der Storage Box"
if [ -f "$CONF_DIR/common.env" ] && [ -f "$SSH_KEY" ] && command -v restic >/dev/null 2>&1 && command -v sqlite3 >/dev/null 2>&1; then
  # Die Funktionen des Sicherungs-Skripts laden (aus dem Repo-Stand, nicht aus /usr/local/bin - im Prüfmodus liegt es noch nicht dort).
  FAP_BACKUP_SOURCE_ONLY=1 source "$HAERTUNG_DIR/fap-backup.sh"
  fb_load_common
  fb_init_repos
else
  info "Noch nicht möglich (Prüfmodus oder erste Schritte fehlen) - übernimmt der nächste Lauf"
fi

heading "systemd: fap-backup.service und fap-backup.timer (03:50 Uhr)"
changed=0
write_if_changed /etc/systemd/system/fap-backup.service 0644 <<'EOF' && changed=1
# von deploy/haertung/06-restic.sh - Sicherung außer Haus (restic → Storage Box), gestartet vom fap-backup.timer
[Unit]
Description=Familie auf Pfoten - Sicherung außer Haus (restic)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/fap-backup.sh
Nice=10
IOSchedulingClass=idle
TimeoutStartSec=2h
EOF
write_if_changed /etc/systemd/system/fap-backup.timer 0644 <<'EOF' && changed=1
# von deploy/haertung/06-restic.sh - täglich 03:50 (App-Sicherung 03:30, Update-Neustart frühestens 04:00). Persistent:
# ein verpasster Lauf (Server war aus) wird nachgeholt.
[Unit]
Description=Familie auf Pfoten - tägliche Sicherung außer Haus

[Timer]
OnCalendar=*-*-* 03:50:00
Persistent=true
RandomizedDelaySec=120

[Install]
WantedBy=timers.target
EOF
[ "$changed" = 0 ] || systemctl daemon-reload
ensure_enabled fap-backup.timer

heading "Nächste Schritte"
info "1. Öffentlichen Schlüssel (oben) im Sub-Account der Storage Box eintragen, falls noch nicht geschehen."
info "2. Probe ohne Sicherung:   sudo $BACKUP_BIN --check"
info "3. Erste Sicherung jetzt:  sudo systemctl start fap-backup.service && journalctl -u fap-backup -n 30 --no-pager"
info "4. Aufbewahrung (forget/prune) vom eigenen Rechner aus - README, Block 6. Stand jederzeit: check.sh"

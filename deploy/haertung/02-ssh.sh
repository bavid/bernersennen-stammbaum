#!/usr/bin/env bash
# Block 2 - SSH härten in zwei Phasen.
# Phase A (ohne Flag): Deploy-Nutzer anlegen (Name DEPLOY_USER_NAME, Standard „deploy“, UID 1000 = der Nutzer „node“ im
#   Container, dem die Daten gehören), denselben SSH-Schlüssel wie root eintragen, sudo-Regeln aus sudoers-fap-deploy.tpl,
#   ein sudo-Passwort (einmal angezeigt, in den Passwort-Manager!), App-Ordner dem Nutzer übergeben, und sshd:
#   kein Passwort-Login, MaxAuthTries 3, LoginGraceTime 30. Root bleibt per Schlüssel erlaubt.
# Phase B (--confirm-key-tested, erst nachdem der Login als neuer Nutzer in einem ZWEITEN Terminal geklappt hat):
#   PermitRootLogin no und AllowUsers nur noch der Deploy-Nutzer. Ohne das Flag verweigert das Skript diesen Schritt.
# sshd wird nur neu geladen (reload), offene Sitzungen bleiben bestehen. Port 22 bleibt. --check zeigt alles nur.
set -euo pipefail
HAERTUNG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HAERTUNG_DIR/lib.sh"

usage() {
  cat <<'EOF'
Aufruf: 02-ssh.sh [--check] [--confirm-key-tested]
  DEPLOY_USER_NAME=deploy   Name des Deploy-Nutzers
  DEPLOY_UID=1000           UID (muss zum Nutzer „node“ im Container passen, dem data/ gehört)
  FAP_INSTANCES=…           App-Ordner, die dem Nutzer übergeben werden (siehe lib.sh)
  --confirm-key-tested      Phase B: Root-Login abschalten - nur nach erfolgreichem Test in einem zweiten Terminal
EOF
}
CONFIRM=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --confirm-key-tested) CONFIRM=1 ;;
    *) ARGS+=("$arg") ;;
  esac
done
EXTRA_FLAGS="--confirm-key-tested"
parse_flags "${ARGS[@]+"${ARGS[@]}"}"
need_root

USER_NAME="${DEPLOY_USER_NAME:-deploy}"
WANT_UID="${DEPLOY_UID:-1000}"
SSHD_DROPIN=/etc/ssh/sshd_config.d/10-fap-haertung.conf
SUDOERS=/etc/sudoers.d/fap-deploy
ROOT_KEYS=/root/.ssh/authorized_keys

[[ "$USER_NAME" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || fail "Ungültiger Nutzername: $USER_NAME"
[ -s "$ROOT_KEYS" ] || fail "$ROOT_KEYS fehlt oder ist leer - ohne Schlüssel würde der neue Nutzer ausgesperrt"

heading "Nutzer $USER_NAME (UID $WANT_UID)"
if id -u "$USER_NAME" >/dev/null 2>&1; then
  have_uid="$(id -u "$USER_NAME")"
  if [ "$have_uid" != "$WANT_UID" ]; then
    fail "$USER_NAME hat UID $have_uid, erwartet $WANT_UID - data/ gehört UID 1000 (Container-Nutzer node). Bitte entscheiden (README, Block 2)."
  fi
  ok "Nutzer existiert"
else
  if other="$(getent passwd "$WANT_UID" | cut -d: -f1)" && [ -n "$other" ]; then
    fail "UID $WANT_UID gehört schon „$other“. Entweder diesen Nutzer verwenden (DEPLOY_USER_NAME=$other) oder entscheiden, wem data/ gehören soll (README, Block 2)."
  fi
  if apply "Nutzer $USER_NAME mit UID $WANT_UID, Home /home/$USER_NAME, Shell bash anlegen"; then
    useradd --create-home --uid "$WANT_UID" --shell /bin/bash --comment "Deploy Familie auf Pfoten" "$USER_NAME"
  fi
fi
HOME_DIR="/home/$USER_NAME"

heading "SSH-Schlüssel übernehmen"
USER_KEYS="$HOME_DIR/.ssh/authorized_keys"
missing="$(grep -vE '^\s*(#|$)' "$ROOT_KEYS" | while IFS= read -r line; do
  grep -qxF -- "$line" "$USER_KEYS" 2>/dev/null || printf '%s\n' "$line"
done)" || true
if [ -z "$missing" ]; then
  ok "alle Schlüssel aus $ROOT_KEYS sind in $USER_KEYS"
elif apply "$(printf '%s' "$missing" | grep -c .) Schlüssel aus $ROOT_KEYS nach $USER_KEYS übernehmen (700/600)"; then
  install -d -o "$USER_NAME" -g "$USER_NAME" -m 700 "$HOME_DIR/.ssh"
  touch "$USER_KEYS"
  printf '%s\n' "$missing" >>"$USER_KEYS"
  chown "$USER_NAME:$USER_NAME" "$USER_KEYS"
  chmod 600 "$USER_KEYS"
fi

heading "sudo-Passwort (nur für Wartung, nie zum Anmelden)"
if id -u "$USER_NAME" >/dev/null 2>&1 && [ "$(passwd -S "$USER_NAME" | awk '{print $2}')" = "P" ]; then
  ok "Passwort ist gesetzt"
elif apply "zufälliges sudo-Passwort setzen und EINMAL anzeigen"; then
  pw="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
  printf '%s:%s\n' "$USER_NAME" "$pw" | chpasswd
  printf '\n    *** sudo-Passwort für %s: %s ***\n    Jetzt in den Passwort-Manager - es wird nie wieder angezeigt.\n\n' "$USER_NAME" "$pw"
  unset pw
fi

heading "sudo-Regeln $SUDOERS"
rendered="$(mktemp)"
sed "s/__USER__/$USER_NAME/g" "$HAERTUNG_DIR/sudoers-fap-deploy.tpl" >"$rendered"
visudo -cf "$rendered" >/dev/null || { rm -f "$rendered"; fail "sudoers-Vorlage ist ungültig (visudo -c)"; }
write_if_changed "$SUDOERS" 0440 <"$rendered" || true
rm -f "$rendered"

heading "App-Ordner dem Deploy-Nutzer übergeben"
while IFS='|' read -r name dir; do
  [ -n "$dir" ] || continue
  owner="$(stat -c %U "$dir")"
  if [ "$owner" = "$USER_NAME" ]; then
    ok "$dir ($name) gehört $USER_NAME"
  elif apply "$dir ($name) rekursiv an $USER_NAME übergeben (data/ gehört ohnehin UID $WANT_UID)"; then
    chown -R "$USER_NAME:$USER_NAME" "$dir"
  fi
done < <(fap_instances)

heading "sshd"
root_login="prohibit-password"
allow_users="root $USER_NAME"
if [ "$CONFIRM" = 1 ]; then
  if ! grep -qxF "$(grep -vE '^\s*(#|$)' "$ROOT_KEYS" | head -1)" "$USER_KEYS" 2>/dev/null; then
    fail "Der Schlüssel steht noch nicht in $USER_KEYS - erst Phase A ohne Flag laufen lassen."
  fi
  root_login="no"
  allow_users="$USER_NAME"
  warn "Phase B: Root-Login wird abgeschaltet. Diese Sitzung bleibt offen; neue Anmeldungen nur noch als $USER_NAME."
elif grep -qE '^PermitRootLogin no' "$SSHD_DROPIN" 2>/dev/null; then
  # Schon abgeschaltet - bleibt so (idempotent), auch ohne Flag.
  root_login="no"
  allow_users="$USER_NAME"
  ok "Root-Login ist bereits abgeschaltet (bleibt)"
else
  info "Phase A: Root-Login per Schlüssel bleibt erlaubt. Phase B später mit --confirm-key-tested."
fi

sshd_before="$(mktemp)"
[ -f "$SSHD_DROPIN" ] && cp "$SSHD_DROPIN" "$sshd_before"
if write_if_changed "$SSHD_DROPIN" 0644 <<EOF
# Von deploy/haertung/02-ssh.sh. Liegt vor 50-cloud-init.conf - bei sshd zählt die ERSTE Angabe.
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PermitRootLogin $root_login
AllowUsers $allow_users
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
EOF
then
  if sshd -t; then
    # Ubuntu startet sshd über ssh.socket: läuft der Dienst gerade nicht, gilt die neue Datei einfach ab der nächsten
    # Verbindung (try-reload-or-restart tut dann nichts). Offene Sitzungen bleiben in jedem Fall bestehen.
    systemctl try-reload-or-restart ssh.service 2>/dev/null || systemctl try-reload-or-restart sshd.service
    ok "sshd neu geladen (offene Sitzungen bleiben)"
  else
    warn "sshd -t meldet einen Fehler - Änderung wird zurückgenommen"
    if [ -s "$sshd_before" ]; then cp "$sshd_before" "$SSHD_DROPIN"; else rm -f "$SSHD_DROPIN"; fi
    rm -f "$sshd_before"
    fail "sshd-Konfiguration ungültig, alter Stand wiederhergestellt"
  fi
fi
rm -f "$sshd_before"

heading "Wirksame sshd-Werte"
sshd -T 2>/dev/null | grep -iE '^(port|passwordauthentication|permitrootlogin|allowusers|maxauthtries|logingracetime|pubkeyauthentication) ' | sed 's/^/    /'

heading "Nächster Schritt"
if [ "$CONFIRM" = 1 ] && [ "$CHECK" = 0 ]; then
  info "In .deploy.env und .deploy.staging.env: DEPLOY_USER=$USER_NAME. manage.ps1 arbeitet dann als $USER_NAME (sudo nur für docker)."
else
  info "In einem ZWEITEN Terminal testen:  ssh $USER_NAME@\$DEPLOY_HOST 'sudo -n docker ps'"
  info "Klappt das, Phase B:  02-ssh.sh --confirm-key-tested"
fi

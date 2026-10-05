#!/usr/bin/env bash
# Stand der Härtung auf einen Blick (nur lesend, keine Netzverbindung): SSH-Einstellungen, Deploy-Nutzer, Firewall,
# Updates, CrowdSec, Container-Härtung, Timer und die letzten Sicherungen (App, außer Haus, Wiederherstellungs-Probe).
# Aufruf als root bzw. sudo bash check.sh. --check ist erlaubt, ändert aber nichts - das Skript ändert nie etwas.
set -euo pipefail
HAERTUNG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HAERTUNG_DIR/lib.sh"

usage() { printf 'Aufruf: check.sh [--check]   (nur lesend; FAP_INSTANCES=… siehe lib.sh)\n'; }
parse_flags "$@"
need_root

USER_NAME="${DEPLOY_USER_NAME:-deploy}"
CONF_DIR=/etc/fap-backup
STATE_DIR=/var/lib/fap-backup

# Wert eines Schlüssels aus einer kleinen JSON-Datei (unsere Markierungen), leer wenn Datei oder Schlüssel fehlt.
json_field() {
  [ -f "$1" ] || return 0
  grep -oE "\"$2\":(\"[^\"]*\"|[0-9a-z.]+)" "$1" | head -n1 | cut -d: -f2- | tr -d '"'
}
# „vor 3 h“ aus einer ISO-Zeit, oder „-“.
ago() {
  [ -n "${1:-}" ] || { printf -- '-'; return 0; }
  local then now diff
  then="$(date -d "$1" +%s 2>/dev/null)" || { printf '%s' "$1"; return 0; }
  now="$(date +%s)"
  diff=$((now - then))
  if [ "$diff" -lt 7200 ]; then printf 'vor %d min' $((diff / 60)); elif [ "$diff" -lt 172800 ]; then printf 'vor %d h' $((diff / 3600)); else printf 'vor %d Tagen' $((diff / 86400)); fi
}
yesno() { if "$@" >/dev/null 2>&1; then printf 'ja'; else printf 'nein'; fi; }
# Größe („bytes“) einer Markierung in MB, 0 wenn sie fehlt.
mb() {
  local bytes
  bytes="$(json_field "$1" bytes)"
  printf '%d' $(( ${bytes:-0} / 1024 / 1024 ))
}

heading "SSH"
sshd -T 2>/dev/null | grep -iE '^(port|passwordauthentication|permitrootlogin|allowusers|maxauthtries|logingracetime) ' | sed 's/^/    /' || warn "sshd -T nicht möglich"
if id -u "$USER_NAME" >/dev/null 2>&1; then
  info "Deploy-Nutzer $USER_NAME: UID $(id -u "$USER_NAME"), Schlüssel: $(grep -c . "/home/$USER_NAME/.ssh/authorized_keys" 2>/dev/null || echo 0), sudo-Regeln: $(yesno test -f /etc/sudoers.d/fap-deploy)"
else
  info "Deploy-Nutzer $USER_NAME: fehlt (Block 2)"
fi

heading "Firewall (ufw)"
if command -v ufw >/dev/null 2>&1; then
  ufw status 2>/dev/null | grep -E '^(Status|[0-9])' | grep -vE '\(v6\)' | awk '{printf "    %-12s %-8s %s\n", $1, $2, $3}'
else
  info "ufw fehlt"
fi

heading "Updates"
info "unattended-upgrades aktiv: $(yesno systemctl is-active unattended-upgrades.service) · Neustart um: $(apt-config dump 2>/dev/null | grep -oE 'Automatic-Reboot-Time "[^"]*"' | cut -d'"' -f2 || echo '-')"
info "Letzter Lauf: $(grep -E 'INFO (Packages that will be upgraded|No packages found)' /var/log/unattended-upgrades/unattended-upgrades.log 2>/dev/null | tail -n1 | cut -c1-110 || echo 'noch keiner')"
[ -f /var/run/reboot-required ] && warn "Neustart steht aus (/var/run/reboot-required)"

heading "CrowdSec"
if command -v cscli >/dev/null 2>&1; then
  info "crowdsec: $(systemctl is-active crowdsec 2>/dev/null) · firewall-bouncer: $(systemctl is-active crowdsec-firewall-bouncer 2>/dev/null) · aktive Sperren: $(cscli decisions list -o raw 2>/dev/null | tail -n +2 | grep -c . || echo 0)"
  info "Sammlungen: $(cscli collections list -o raw 2>/dev/null | tail -n +2 | cut -d, -f1 | tr '\n' ' ')"
else
  info "nicht installiert (Block 4)"
fi

heading "Docker"
if command -v docker >/dev/null 2>&1; then
  docker ps --format '    {{.Names}}: {{.Status}}' 2>/dev/null || true
  while IFS='|' read -r name dir; do
    [ -n "$dir" ] || continue
    container="$(env_value_of "$dir/.env" CONTAINER_NAME)"
    container="${container:-bernersennen-stammbaum}"
    docker inspect "$container" >/dev/null 2>&1 || continue
    docker inspect -f "    $name ($container): no-new-privileges={{range .HostConfig.SecurityOpt}}{{.}} {{end}} cap_drop={{.HostConfig.CapDrop}} read_only={{.HostConfig.ReadonlyRootfs}} mem={{.HostConfig.Memory}} pids={{.HostConfig.PidsLimit}}" "$container"
  done < <(fap_instances)
else
  info "docker fehlt"
fi

heading "Timer"
systemctl list-timers fap-backup.timer apt-daily-upgrade.timer --no-pager 2>/dev/null | sed -n '2,3p' | sed 's/^/    /' || true
systemctl is-enabled fap-backup.timer >/dev/null 2>&1 || info "fap-backup.timer fehlt (Block 6)"

heading "Sicherungen"
while IFS='|' read -r name dir; do
  [ -n "$dir" ] || continue
  marker="$dir/data/backups/last-backup.json"
  offsite="$dir/data/backups/last-offsite-backup.json"
  run="$STATE_DIR/$name/last-run.json"
  probe="$STATE_DIR/$name/last-restore-test.json"
  kind="$(json_field "$marker" kind)"
  run_ok="$(json_field "$run" ok)"
  snapshot="$(json_field "$run" snapshot)"
  probe_ok="$(json_field "$probe" ok)"
  info "$name:"
  info "  App (${kind:--}): $(ago "$(json_field "$marker" at)") · $(mb "$marker") MB"
  info "  Außer Haus: $(ago "$(json_field "$offsite" at)") · $(mb "$offsite") MB · letzter Lauf ok: ${run_ok:--} · Schnappschuss ${snapshot:--}"
  info "  Wiederherstellungs-Probe: $(ago "$(json_field "$probe" at)") · ok: ${probe_ok:--}"
done < <(fap_instances)
[ -f "$CONF_DIR/common.env" ] || info "Sicherung außer Haus nicht eingerichtet (Block 6)"

heading "Platte"
df -h / | sed 's/^/    /'

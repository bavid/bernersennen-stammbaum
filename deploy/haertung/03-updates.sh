#!/usr/bin/env bash
# Block 3 - automatische Sicherheits-Updates: unattended-upgrades nur für die Sicherheits-Quellen, Neustart (nur wenn
# ein Update ihn verlangt) um 04:00 Uhr - nach der App-Sicherung (03:30) und der Sicherung außer Haus (03:50) -,
# keine E-Mails, apt-listchanges weg, tägliche Timer aktiv. Zum Schluss die wirksame Konfiguration und ein Probelauf
# (--dry-run, ändert nichts). --check zeigt nur, was sich ändern würde.
set -euo pipefail
HAERTUNG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HAERTUNG_DIR/lib.sh"

usage() { printf 'Aufruf: 03-updates.sh [--check]\n'; }
parse_flags "$@"
need_root
export DEBIAN_FRONTEND=noninteractive

heading "Pakete"
ensure_package unattended-upgrades
if dpkg-query -W -f='${Status}' apt-listchanges 2>/dev/null | grep -q 'install ok installed'; then
  if apply "apt-listchanges entfernen (nur Mail-/Pager-Ausgabe, auf einem Server ohne Nutzen)"; then
    apt-get purge -y -q apt-listchanges
  fi
else
  ok "apt-listchanges ist nicht installiert"
fi

heading "Konfiguration"
write_if_changed /etc/apt/apt.conf.d/52fap-unattended-upgrades 0644 <"$HAERTUNG_DIR/apt-52fap-unattended-upgrades.conf" || true
write_if_changed /etc/apt/apt.conf.d/20auto-upgrades 0644 <<'EOF' || true
// von deploy/haertung/03-updates.sh: täglich Paketlisten holen und Sicherheits-Updates einspielen
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

heading "Dienste"
ensure_enabled unattended-upgrades.service
for timer in apt-daily.timer apt-daily-upgrade.timer; do
  ensure_enabled "$timer"
done

heading "Wirksame Werte"
apt-config dump 2>/dev/null | grep -E '^(Unattended-Upgrade::(Allowed-Origins|Automatic-Reboot|Mail|Remove-Unused|MinimalSteps)|APT::Periodic::(Update-Package-Lists|Unattended-Upgrade))' | sed 's/^/    /'

heading "Probelauf (unattended-upgrades --dry-run, ändert nichts)"
if command -v unattended-upgrades >/dev/null 2>&1; then
  timeout 180 unattended-upgrades --dry-run 2>&1 | tail -n 8 | sed 's/^/    /' || warn "Probelauf abgebrochen oder fehlgeschlagen"
else
  info "unattended-upgrades fehlt noch (Prüfmodus)"
fi
info "Verlauf später: /var/log/unattended-upgrades/unattended-upgrades.log · Neustart-Bedarf: /var/run/reboot-required"

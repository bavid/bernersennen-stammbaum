#!/usr/bin/env bash
# Block 4 - CrowdSec (Open Source, statt nur fail2ban): erkennt Angriffe in den Logs von sshd (Journal) und des
# Caddy-Proxys (Docker-Logs des Containers server-proxy) und sperrt die Absender.
# Sperren setzt der **Firewall-Bouncer** (crowdsec-firewall-bouncer-nftables) direkt auf dem Host - nicht der
# Caddy-Bouncer: der bräuchte ein eigenes Caddy-Image mit Plugin im gemeinsamen Proxy (/opt/proxy, anderes Repo),
# also einen Eingriff in alles, was dort läuft. Der Firewall-Bouncer sperrt dafür alle Ports zugleich (auch SSH) und
# hängt sich mit nftables_hooks input+forward auch vor die weitergeleiteten Docker-Ports des Proxys.
# Die Caddy-Logs kommen nur an, wenn der Proxy Zugriffe als JSON nach stdout loggt - das Skript prüft die Caddyfile
# (nur lesend) und schlägt den Block vor. OPERATOR_IP (optional) wird nie gesperrt.
# Die Installation nutzt das offizielle Repo-Skript von CrowdSec: es wird erst heruntergeladen und gezeigt (Größe,
# SHA-256), dann ausgeführt - kein blindes „curl | sh“. --check lädt und zeigt nur.
set -euo pipefail
HAERTUNG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HAERTUNG_DIR/lib.sh"

usage() {
  cat <<'EOF'
Aufruf: 04-crowdsec.sh [--check]
  OPERATOR_IP=…                    (optional) eigene feste IP, wird nie gesperrt
  PROXY_CONTAINER=server-proxy     Caddy-Proxy-Container, dessen Logs gelesen werden
  CADDYFILE=/opt/proxy/Caddyfile   nur lesend geprüft (log-Direktive vorhanden?)
EOF
}
parse_flags "$@"
need_root
export DEBIAN_FRONTEND=noninteractive

OPERATOR_IP="${OPERATOR_IP:-}"
PROXY_CONTAINER="${PROXY_CONTAINER:-server-proxy}"
CADDYFILE="${CADDYFILE:-/opt/proxy/Caddyfile}"
INSTALL_URL="https://install.crowdsec.net"
ACQUIS_DIR=/etc/crowdsec/acquis.d
BOUNCER_CFG=/etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml
WHITELIST=/etc/crowdsec/parsers/s02-enrich/fap-whitelist.yaml
COLLECTIONS=(crowdsecurity/linux crowdsecurity/sshd crowdsecurity/caddy)

heading "Paketquelle und Pakete"
if command -v cscli >/dev/null 2>&1; then
  ok "CrowdSec ist installiert ($(cscli version 2>/dev/null | grep -m1 -oE 'v[0-9][0-9.]*' || echo '?'))"
else
  script="$(mktemp)"
  curl -fsSL --max-time 60 -o "$script" "$INSTALL_URL" || fail "Repo-Skript von $INSTALL_URL ließ sich nicht laden"
  info "Repo-Skript geladen: $(wc -c <"$script") Bytes, SHA-256 $(sha256sum "$script" | cut -c1-16)…"
  info "Anfang:"
  head -n 12 "$script" | sed 's/^/      | /'
  if apply "Repo-Skript ausführen (richtet die CrowdSec-Paketquelle ein)"; then
    sh "$script"
  fi
  rm -f "$script"
fi
ensure_package crowdsec crowdsec-firewall-bouncer-nftables

if ! command -v cscli >/dev/null 2>&1; then
  info "Ohne installiertes CrowdSec enden die weiteren Prüfungen hier (Prüfmodus)."
  exit 0
fi

heading "Sammlungen (Parser + Szenarien)"
installed="$(cscli collections list -o raw 2>/dev/null || true)"
for coll in "${COLLECTIONS[@]}"; do
  if printf '%s' "$installed" | grep -q "^$coll,"; then
    ok "$coll"
  elif apply "Sammlung $coll installieren"; then
    cscli collections install "$coll"
  fi
done

heading "Log-Quellen"
mkdir -p "$ACQUIS_DIR"
if grep -rqs 'ssh.service' /etc/crowdsec/acquis.yaml "$ACQUIS_DIR" 2>/dev/null; then
  ok "sshd (Journal) wird bereits gelesen"
else
  write_if_changed "$ACQUIS_DIR/fap-sshd.yaml" 0644 <<'EOF' || true
# von deploy/haertung/04-crowdsec.sh: SSH-Anmeldungen aus dem Journal
source: journalctl
journalctl_filter:
  - "_SYSTEMD_UNIT=ssh.service"
labels:
  type: syslog
EOF
fi
write_if_changed "$ACQUIS_DIR/fap-caddy.yaml" 0644 <<EOF || true
# von deploy/haertung/04-crowdsec.sh: Zugriffs-Logs des gemeinsamen Caddy-Proxys (JSON nach stdout, siehe README)
source: docker
container_name:
  - $PROXY_CONTAINER
labels:
  type: caddy
EOF
if [ -f "$CADDYFILE" ]; then
  if sed 's/#.*//' "$CADDYFILE" | grep -qE '^\s*log\b'; then
    ok "Caddyfile hat eine log-Direktive"
  else
    warn "Die Caddyfile ($CADDYFILE) loggt keine Zugriffe - CrowdSec sieht dann nur SSH. Vorschlag für jeden Seitenblock (Repo „server“, Freigabe nötig):"
    cat <<'EOF' | sed 's/^/      /'
  log {
    output stdout
    format json
  }
EOF
  fi
else
  warn "Caddyfile $CADDYFILE nicht gefunden - Caddy-Logs bitte von Hand prüfen"
fi

heading "Firewall-Bouncer"
if [ -f "$BOUNCER_CFG" ]; then
  if grep -q '^mode: nftables' "$BOUNCER_CFG"; then ok "Modus nftables"; else warn "Bouncer-Modus ist nicht nftables - bitte $BOUNCER_CFG prüfen"; fi
  if grep -q '^nftables_hooks:' "$BOUNCER_CFG"; then
    if sed -n '/^nftables_hooks:/,/^[^ -]/p' "$BOUNCER_CFG" | grep -q 'forward'; then
      ok "nftables_hooks enthält forward (Docker-Weiterleitungen werden gesperrt)"
    else
      warn "nftables_hooks ohne forward - bitte in $BOUNCER_CFG „- forward“ ergänzen, sonst erreichen Gesperrte den Proxy weiter"
    fi
  elif apply "nftables_hooks (input, forward) an $BOUNCER_CFG anhängen"; then
    printf '\n# von deploy/haertung/04-crowdsec.sh: auch weitergeleitete Docker-Ports (Proxy) sperren\nnftables_hooks:\n  - input\n  - forward\n' >>"$BOUNCER_CFG"
    systemctl restart crowdsec-firewall-bouncer
  fi
else
  warn "$BOUNCER_CFG fehlt - Bouncer-Paket noch nicht installiert (Prüfmodus) oder Installation fehlgeschlagen"
fi

heading "Ausnahme für den Betreiber"
if [ -n "$OPERATOR_IP" ]; then
  [[ "$OPERATOR_IP" =~ ^[0-9a-fA-F.:/]+$ ]] || fail "OPERATOR_IP sieht nicht wie eine IP aus"
  write_if_changed "$WHITELIST" 0644 <<EOF || true
# von deploy/haertung/04-crowdsec.sh: die Adresse des Betreibers wird nie gesperrt
name: fap/betreiber-whitelist
description: "Betreiber-IP nie sperren"
whitelist:
  reason: "Betreiber"
  ip:
    - "$OPERATOR_IP"
EOF
else
  info "OPERATOR_IP nicht gesetzt - keine Ausnahme (später jederzeit möglich: OPERATOR_IP=… 04-crowdsec.sh)"
fi

heading "Dienste"
ensure_enabled crowdsec.service
ensure_enabled crowdsec-firewall-bouncer.service
if [ "$CHECK" = 0 ]; then
  systemctl reload crowdsec 2>/dev/null || systemctl restart crowdsec
fi

heading "Status"
cscli lapi status 2>&1 | tail -n 2 | sed 's/^/    /' || true
cscli bouncers list 2>/dev/null | sed 's/^/    /' || true
info "Aktive Sperren: $(cscli decisions list -o raw 2>/dev/null | tail -n +2 | wc -l)"
info "Nützlich: cscli metrics · cscli decisions list · cscli alerts list · journalctl -u crowdsec -n 50"

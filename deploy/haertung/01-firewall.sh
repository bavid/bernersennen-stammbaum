#!/usr/bin/env bash
# Block 1 - Firewall (ufw): offen bleiben nur 22 (SSH, später nur noch über VPN), 80 und 443. Die App-Ports 3000, 3005
# und 3010 schließt das Skript - AUSSER der gemeinsame Caddy-Proxy (/opt/proxy) bedient dort heute noch Seiten: dann
# bleiben sie offen, bis die eigene Domain da ist (danach dieses Skript erneut laufen lassen). Dafür liest es die
# Caddyfile und die veröffentlichten Ports des Proxy-Containers - nur lesend, /opt/proxy wird nie verändert.
# Die App-Container selbst lauschen ohnehin nur auf 127.0.0.1. Zweite Schicht (Hetzner Cloud Firewall): siehe README.
# --check zeigt den Befund und die geplanten Änderungen, ändert aber nichts.
set -euo pipefail
HAERTUNG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HAERTUNG_DIR/lib.sh"

usage() {
  cat <<'EOF'
Aufruf: 01-firewall.sh [--check]
  CADDYFILE=/opt/proxy/Caddyfile   Caddyfile des gemeinsamen Proxys (nur lesend)
  PROXY_CONTAINER=server-proxy     Name des Proxy-Containers (nur lesend)
EOF
}
parse_flags "$@"
need_root

CADDYFILE="${CADDYFILE:-/opt/proxy/Caddyfile}"
PROXY_CONTAINER="${PROXY_CONTAINER:-server-proxy}"
KEEP_PORTS=(22 80 443)
APP_PORTS=(3000 3005 3010)

command -v ufw >/dev/null 2>&1 || fail "ufw ist nicht installiert - dieses Skript erwartet die heutige ufw-Firewall"
if ! ufw status | grep -q '^Status: active'; then
  fail "ufw ist nicht aktiv. Bitte zuerst von Hand prüfen (ufw status) - dieses Skript schaltet die Firewall nicht ein."
fi

# Bedient der Proxy einen Port öffentlich? Zwei Quellen: Seitenadressen in der Caddyfile (z. B. „https://HOST:3010 {“ -
# Zeilen mit reverse_proxy/127.0.0.1 sind das Ziel, nicht die Adresse) und die veröffentlichten Ports des Containers.
caddy_serves_port() {
  local port="$1"
  if [ -f "$CADDYFILE" ]; then
    if sed 's/#.*//' "$CADDYFILE" | grep -vE 'reverse_proxy|127\.0\.0\.1|localhost' | grep -Eq "(^|[^0-9]):${port}([^0-9]|$)"; then
      return 0
    fi
  fi
  if command -v docker >/dev/null 2>&1 && docker inspect -f '{{json .HostConfig.PortBindings}}' "$PROXY_CONTAINER" 2>/dev/null | grep -q "\"${port}/tcp\""; then
    return 0
  fi
  return 1
}

heading "Befund: Caddy-Proxy"
if [ -f "$CADDYFILE" ]; then
  info "Caddyfile: $CADDYFILE"
  info "Seitenadressen (ohne Kommentare, ohne reverse_proxy-Ziele):"
  sed 's/#.*//' "$CADDYFILE" | grep -E '\{\s*$' | grep -vE 'reverse_proxy|^\s*\{' | sed 's/^/      /' || info "      (keine gefunden)"
else
  warn "Caddyfile $CADDYFILE nicht gefunden - nur die veröffentlichten Ports des Containers zählen"
fi
if command -v docker >/dev/null 2>&1; then
  info "Veröffentlichte Ports von $PROXY_CONTAINER: $(docker port "$PROXY_CONTAINER" 2>/dev/null | tr '\n' ' ' || echo '(Container nicht gefunden)')"
fi

heading "Heutige Regeln"
ufw status verbose | sed 's/^/    /'

heading "Grundeinstellung"
if ufw status verbose | grep -q 'Default: deny (incoming), allow (outgoing)'; then
  ok "eingehend verboten, ausgehend erlaubt"
elif apply "Standard setzen: eingehend verboten, ausgehend erlaubt"; then
  ufw default deny incoming
  ufw default allow outgoing
fi

rule_exists() {
  # ufw listet „22/tcp  ALLOW  Anywhere“ oder „22  ALLOW  Anywhere“ - beides zählt (und v6 steht darunter).
  ufw status | grep -Eq "^$1\s+ALLOW"
}

heading "Offen halten: ${KEEP_PORTS[*]}"
for port in "${KEEP_PORTS[@]}"; do
  if rule_exists "$port/tcp" || rule_exists "$port"; then
    ok "Port $port ist erlaubt"
  elif apply "Port $port/tcp erlauben"; then
    ufw allow "$port/tcp" comment "fap: $port"
  fi
done

heading "App-Ports: ${APP_PORTS[*]}"
for port in "${APP_PORTS[@]}"; do
  if caddy_serves_port "$port"; then
    info "Port $port: der Proxy bedient ihn noch öffentlich - bleibt offen, bis die eigene Domain läuft"
    if ! rule_exists "$port/tcp" && ! rule_exists "$port"; then
      warn "Port $port ist in ufw gar nicht offen, der Proxy lauscht aber dort - bitte prüfen"
    fi
    continue
  fi
  closed_any=0
  for spec in "$port" "$port/tcp" "$port/udp"; do
    if rule_exists "$spec"; then
      closed_any=1
      if apply "Regel „allow $spec“ löschen (v4 und v6)"; then
        ufw --force delete allow "$spec" || warn "Regel $spec ließ sich nicht löschen"
      fi
    fi
  done
  [ "$closed_any" = 1 ] || ok "Port $port ist bereits geschlossen"
done

if ufw status verbose | grep -q '^Logging: off'; then
  if apply "Protokoll auf „low“ stellen (geblockte Pakete sparsam ins Journal)"; then
    ufw logging low
  fi
fi

heading "Ergebnis"
ufw status verbose | sed 's/^/    /'
info "Hetzner Cloud Firewall (zweite Schicht, Konsole) mit denselben Regeln anlegen - siehe README, Block 1."

#!/usr/bin/env bash
# Gemeinsame Helfer der Härtungs-Skripte (deploy/haertung): Ausgabe, --check-Modus („nur zeigen, nichts ändern“),
# Root-Prüfung, Liste der App-Instanzen und das Schreiben von Konfigurationsdateien nur bei Änderung.
# Wird von den Skripten per `source` geladen - nicht direkt aufrufen. Alle Skripte laufen AUF dem Server als root
# (bzw. über sudo); der Ordner wird mit scp nach ~/haertung kopiert (README). Nichts hier kennt die Server-IP.
set -euo pipefail

# Optionale Einstellungen des Betreibers (nicht versioniert, siehe haertung.env.example) - Werte darin gelten nur,
# wenn die Variable nicht schon in der Umgebung gesetzt ist.
HAERTUNG_DIR="${HAERTUNG_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
if [ -f "$HAERTUNG_DIR/haertung.env" ]; then
  # shellcheck disable=SC1091
  set -a && source "$HAERTUNG_DIR/haertung.env" && set +a
fi

# --check: nur berichten. Jedes Skript setzt CHECK aus seinen Argumenten (parse_flags) - hier nur der Standard.
CHECK="${CHECK:-0}"

log() { printf '==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf 'WARNUNG: %s\n' "$*" >&2; }
fail() { printf 'FEHLER: %s\n' "$*" >&2; exit 1; }
heading() { printf '\n--- %s ---\n' "$*"; }

# Setzt CHECK=1 für --check und meldet unbekannte Optionen. Weitere bekannte Flags übergibt das Skript vorher selbst.
parse_flags() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --check) CHECK=1 ;;
      -h | --help) usage; exit 0 ;;
      *) fail "Unbekannte Option: $arg (erlaubt: --check${EXTRA_FLAGS:+, $EXTRA_FLAGS})" ;;
    esac
  done
  if [ "$CHECK" = 1 ]; then
    log "Prüfmodus (--check): es wird nur gezeigt, was passieren würde."
  fi
}

# Fallback, falls ein Skript keine eigene usage() definiert.
if ! declare -F usage >/dev/null; then
  usage() { printf 'Aufruf: %s [--check]\n' "$(basename "$0")"; }
fi

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    fail "Bitte als root ausführen (sudo bash $(basename "$0") …)"
  fi
}

# Herzstück des --check-Modus: `if apply "Beschreibung"; then <Änderung>; fi`
# Im Prüfmodus wird „würde: …“ ausgegeben und 1 zurückgegeben (die Änderung unterbleibt), sonst „ändere: …“ und 0.
apply() {
  if [ "$CHECK" = 1 ]; then
    printf '    würde: %s\n' "$*"
    return 1
  fi
  printf '    ändere: %s\n' "$*"
  return 0
}

ok() { printf '    ok: %s\n' "$*"; }

# App-Instanzen als Zeilen „name|app_dir“ - nur die, deren Ordner es gibt. Überschreibbar mit FAP_INSTANCES
# (Leerzeichen-getrennt, z. B. "prod|/opt/bernersennen-stammbaum vorschau|/opt/bernersennen-stammbaum-staging").
fap_instances() {
  local entry
  for entry in ${FAP_INSTANCES:-prod|/opt/bernersennen-stammbaum vorschau|/opt/bernersennen-stammbaum-staging}; do
    [ -d "${entry#*|}" ] && printf '%s\n' "$entry"
  done
  return 0
}

# Wert eines Schlüssels aus einer .env-Datei (KEY=VALUE), leer wenn er fehlt.
env_value_of() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 0
  grep -E "^$key=" "$file" | head -1 | cut -d= -f2- || true
}

# Schreibt stdin nach $1 mit Rechten $2 ($3 = Besitzer, Standard root:root) - aber nur, wenn sich der Inhalt ändert.
# Im Prüfmodus wird die neue Datei als Unterschied gezeigt. Gibt 0 zurück, wenn geschrieben wurde, sonst 1.
write_if_changed() {
  local target="$1" mode="$2" owner="${3:-root:root}" tmp
  tmp="$(mktemp)"
  cat >"$tmp"
  if [ -f "$target" ] && cmp -s "$tmp" "$target"; then
    ok "$target unverändert"
    rm -f "$tmp"
    return 1
  fi
  if [ -f "$target" ]; then
    info "Unterschied zu $target:"
    diff -u "$target" "$tmp" | sed 's/^/      /' || true
  fi
  if apply "$target schreiben ($mode, $owner)"; then
    install -o "${owner%%:*}" -g "${owner##*:}" -m "$mode" "$tmp" "$target"
    rm -f "$tmp"
    return 0
  fi
  rm -f "$tmp"
  return 1
}

# Paket installieren, falls es fehlt (dpkg-Status „installed“).
ensure_package() {
  local pkg
  for pkg in "$@"; do
    if dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q 'install ok installed'; then
      ok "Paket $pkg ist installiert"
    elif apply "Paket $pkg installieren"; then
      DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$pkg"
    fi
  done
}

# systemd-Einheit aktivieren und starten, falls nötig.
ensure_enabled() {
  local unit="$1"
  if systemctl is-enabled --quiet "$unit" 2>/dev/null && systemctl is-active --quiet "$unit" 2>/dev/null; then
    ok "$unit ist aktiv"
  elif apply "$unit aktivieren und starten"; then
    systemctl enable --now "$unit"
  fi
}

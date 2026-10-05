#!/usr/bin/env bash
# Block 5 - Docker-Härtung der App-Container. Die Regeln stehen in der docker-compose.override.yml des Repos
# (no-new-privileges, cap_drop ALL, schreibgeschütztes Dateisystem mit tmpfs für /tmp, Speicher-/CPU-/Prozess-Grenzen;
# Compose lädt die Datei automatisch neben der docker-compose.yml) und kommen über das normale Deploy (manage.ps1 → [3],
# erst Vorschau, dann Prod) auf den Server - dieses Skript baut keinen Container von Hand um. Es zeigt je Instanz, was der
# laufende Container heute hat, was der Stand auf origin vorsieht (git diff), und prüft die neuen Dateien mit
# `docker compose config` gegen die .env der Instanz. Die compose-Dateien des anderen Projekts bleiben unberührt.
# --check und normaler Aufruf tun dasselbe (es wird nichts geändert).
set -euo pipefail
HAERTUNG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HAERTUNG_DIR/lib.sh"

usage() { printf 'Aufruf: 05-docker.sh [--check]   (FAP_INSTANCES=… siehe lib.sh)\n'; }
parse_flags "$@"
need_root
command -v docker >/dev/null 2>&1 || fail "docker fehlt"

COMPOSE_FILES=(docker-compose.yml docker-compose.override.yml)

# Was der laufende Container hat - nur die Felder, um die es hier geht.
show_container() {
  local name="$1"
  if ! docker inspect "$name" >/dev/null 2>&1; then
    info "Container $name läuft nicht"
    return
  fi
  docker inspect -f '    no-new-privileges: {{.HostConfig.SecurityOpt}}
    cap_drop:          {{.HostConfig.CapDrop}}
    read_only:         {{.HostConfig.ReadonlyRootfs}}
    tmpfs:             {{.HostConfig.Tmpfs}}
    mem_limit:         {{.HostConfig.Memory}} Bytes
    cpus (nano):       {{.HostConfig.NanoCpus}}
    pids_limit:        {{.HostConfig.PidsLimit}}
    logging:           {{.HostConfig.LogConfig.Type}} {{.HostConfig.LogConfig.Config}}
    user:              {{.Config.User}}' "$name"
}

# Die compose-Dateien des Repo-Stands auf origin gegen den laufenden Checkout, dann docker compose config damit.
show_pending_compose() {
  local dir="$1" branch file tmp
  local args=()
  branch="$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
  git -C "$dir" fetch -q origin "$branch" 2>/dev/null || { warn "git fetch in $dir fehlgeschlagen (kein Netz?)"; return; }
  tmp="$(mktemp -d)"
  for file in "${COMPOSE_FILES[@]}"; do
    if ! git -C "$dir" cat-file -e "origin/$branch:$file" 2>/dev/null; then
      warn "$file gibt es auf origin/$branch nicht"
      continue
    fi
    if [ -f "$dir/$file" ] && git -C "$dir" diff --quiet HEAD "origin/$branch" -- "$file"; then
      ok "$file ist auf dem Stand von origin/$branch"
    else
      info "Änderung an $file, die das nächste Deploy ($branch) übernimmt:"
      git -C "$dir" diff HEAD "origin/$branch" -- "$file" | sed 's/^/      /'
    fi
    git -C "$dir" show "origin/$branch:$file" >"$tmp/$file"
    args+=(-f "$tmp/$file")
  done
  if [ "${#args[@]}" -gt 0 ] && docker compose --project-directory "$dir" "${args[@]}" config --quiet; then
    ok "docker compose config: der neue Stand ist gültig (mit der .env dieser Instanz)"
  elif [ "${#args[@]}" -gt 0 ]; then
    warn "docker compose config meldet einen Fehler für den neuen Stand"
  fi
  rm -rf "$tmp"
  if grep -qE '^COMPOSE_FILE=' "$dir/.env" 2>/dev/null; then
    warn "COMPOSE_FILE ist in $dir/.env gesetzt - die Override-Datei (Härtung) wird dadurch übergangen"
  fi
}

found=0
while IFS='|' read -r name dir; do
  [ -n "$dir" ] || continue
  found=1
  heading "Instanz $name ($dir)"
  container="$(env_value_of "$dir/.env" CONTAINER_NAME)"
  container="${container:-bernersennen-stammbaum}"
  info "Laufender Container $container:"
  show_container "$container"
  info "Geplanter Stand:"
  show_pending_compose "$dir"
done < <(fap_instances)
[ "$found" = 1 ] || warn "Keine App-Instanz gefunden (FAP_INSTANCES prüfen)"

heading "Übernehmen und zurück"
info "Nichts wird hier geändert. Deploy wie immer: .\\manage.ps1 -Target staging → [3], Vorschau prüfen (Fotos hochladen,"
info "/health, Logs), dann .\\manage.ps1 → [3] bzw. [12] für Prod. Danach dieses Skript erneut: die Werte oben müssen passen."
info "Zurück im Notfall: COMPOSE_FILE=docker-compose.yml in die .env der Instanz, dann dort docker compose up -d."

// Klassen zusammensetzen: leere Werte fallen weg (Bausteine in components/ui).
export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

// Nur erlaubte Werte durchlassen, sonst die Vorgabe - ein Tippfehler im Aufruf macht keine kaputte Klasse.
export function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

import { useEffect, useState } from 'react'
import { api } from '../api'

// Lädt die eingetragenen Verpaarungen des Bereichs (GET /api/breeding, dieselben Daten wie LittersPage). null: lädt
// noch oder ist abgeschaltet (enabled false - der Berner-Auftritt fragt auf der Stammbaum-Seite nicht danach). Schlägt
// es fehl, gilt die Liste als leer: der Nachwuchs-Abschnitt bleibt dann weg und "Stammbaum öffnen" hängt nur noch an
// den Eltern - die Seite darüber läuft weiter.
export default function useBreedingEvents(enabled = true) {
  const [events, setEvents] = useState(null)
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    Promise.resolve()
      .then(() => api.listBreedingEvents())
      .then((list) => {
        if (!cancelled) setEvents(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setEvents([])
      })
    return () => {
      cancelled = true
    }
  }, [enabled])
  return enabled ? events : null
}

import { useEffect, useState } from 'react'
import { api } from '../api'

// Lädt die eingetragenen Verpaarungen des Bereichs (GET /api/breeding, dieselben Daten wie LittersPage). null: lädt
// noch. Schlägt
// es fehl, gilt die Liste als leer: der Nachwuchs-Abschnitt bleibt dann weg und "Stammbaum öffnen" hängt nur noch an
// den Eltern - die Seite darüber läuft weiter.
export default function useBreedingEvents() {
  const [events, setEvents] = useState(null)
  useEffect(() => {
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
  }, [])
  return events
}

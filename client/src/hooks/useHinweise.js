import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'
import {
  REFRESH_MS,
  addDismissed,
  readCachedHinweise,
  readDismissed,
  visibleHinweise,
  writeCachedHinweise,
  writeDismissed
} from '../lib/hinweise.js'

// Die laufenden globalen Hinweise fürs Band (HinweisBand, GET /api/hinweise): einmal beim Laden der Seite, danach bei
// einem Seitenwechsel höchstens alle REFRESH_MS. null, solange nichts geladen ist - das Band erscheint erst danach.
// Audit V7a: die letzte Antwort dieser Browser-Sitzung (readCachedHinweise) gilt schon beim ersten Rendern - so steht
// das Band beim Neuladen oder nächsten Aufruf sofort da, statt die Seite nach der Anfrage nach unten zu schieben.
// Scheitert die Anfrage, bleibt es beim Bisherigen (anfangs: kein Band) - das Band ist ein Zusatz, kein Fehler soll die
// Seite stören.
// Weggeklickte Ids merkt sich sessionStorage (lib/hinweise.js) - in dieser Browser-Sitzung bleiben sie weg, ein neuer
// Hinweis (neue Id) erscheint trotzdem. -> { hinweise: sichtbare | null, dismiss(id) }
export default function useHinweise() {
  const { pathname } = useLocation()
  const [hinweise, setHinweise] = useState(readCachedHinweise)
  const [dismissed, setDismissed] = useState(readDismissed)
  const lastFetch = useRef(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Bewusst ohne Abbruch beim Seitenwechsel: gleich nach dem Laden leitet die App oft weiter (z. B. / -> /stammbaum) -
  // die erste Antwort soll trotzdem ankommen.
  useEffect(() => {
    const now = Date.now()
    if (lastFetch.current !== null && now - lastFetch.current < REFRESH_MS) return
    lastFetch.current = now
    api
      .hinweise()
      .then((result) => {
        const list = Array.isArray(result?.hinweise) ? result.hinweise : []
        writeCachedHinweise(list)
        if (mounted.current) setHinweise(list)
      })
      .catch(() => {
        if (mounted.current) setHinweise((current) => current ?? [])
      })
  }, [pathname])

  const dismiss = useCallback((id) => setDismissed((current) => addDismissed(current, id)), [])

  // Merken erst nach einer Änderung (nicht beim ersten Rendern) - außerhalb des Updaters, der rein bleiben soll.
  const initialDismissed = useRef(dismissed)
  useEffect(() => {
    if (dismissed !== initialDismissed.current) writeDismissed(dismissed)
  }, [dismissed])

  return { hinweise: hinweise === null ? null : visibleHinweise(hinweise, dismissed), dismiss }
}

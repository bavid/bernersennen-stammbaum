import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { SEARCH_DELAY_MS, searchableQuery } from '../lib/search.js'

const IDLE = { status: 'idle', query: null, gruppen: null, error: null, unvollstaendig: false }
const FAILED = 'Die Suche hat gerade nicht geklappt – bitte gleich noch einmal versuchen.'

// Treffer zur Eingabe (POST /api/suche): erst ab zwei Zeichen und nach SEARCH_DELAY_MS ohne weiteres Tippen eine Anfrage;
// eine ältere Antwort, die nach einer neueren Eingabe eintrifft, wird verworfen. Während eine neue Suche läuft, bleiben die
// bisherigen Treffer stehen (status 'loading') - query nennt immer die Suche, zu der gruppen gehört (für die Hervorhebung).
// unvollstaendig: der Server hat nicht alles durchsucht (Arbeitsbudget) - genauer suchen hilft.
// retry(): dieselbe Suche noch einmal (nach einem Fehler), ohne dass sich die Eingabe ändern muss.
export default function useSearchResults(input) {
  const query = searchableQuery(input)
  const [state, setState] = useState(IDLE)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((count) => count + 1), [])

  useEffect(() => {
    if (!query) {
      setState(IDLE)
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      setState((previous) => ({ ...previous, status: 'loading', error: null }))
      api.search(query).then(
        (data) => {
          if (!cancelled) setState({ status: 'done', query, gruppen: data?.gruppen || {}, error: null, unvollstaendig: data?.unvollstaendig === true })
        },
        (err) => {
          // 429 (zu viele Suchen) bringt eine eigene, freundliche Meldung vom Server mit.
          if (!cancelled) setState({ ...IDLE, status: 'error', query, error: err?.status === 429 ? err.message : FAILED })
        }
      )
    }, SEARCH_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, attempt])

  return { ...(query ? state : IDLE), retry }
}

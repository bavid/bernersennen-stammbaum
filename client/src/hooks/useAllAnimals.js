import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { t } from '../lib/i18n/index.js'

const FAILED = 'Die Tiere ließen sich gerade nicht laden.'

// Phase W, Schritt 4: alle Tiere aus Zuhause, Familien und befreundeten Zuhause für den Reiter „Alle“ auf /tiere (GET
// /api/tiere -> { tiere, areas }). data null: lädt noch (oder ist gescheitert - dann steht die Meldung in error);
// retry() lädt noch einmal.
export default function useAllAnimals() {
  const [state, setState] = useState({ data: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => api.tiere())
      .then((data) => {
        if (!cancelled) setState({ data: { tiere: data?.tiere ?? [], areas: data?.areas ?? [] }, error: null })
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, error: err?.message || t(FAILED) })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState({ data: null, error: null })
    setAttempt((count) => count + 1)
  }, [])

  return { ...state, retry }
}

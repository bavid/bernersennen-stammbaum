import { useCallback, useEffect, useRef, useState } from 'react'

// Lädt mit loader() sofort und danach alle intervalMs neu (Bilderrahmen: alle 30 Minuten). key: ändert sich die Auswahl,
// geht es von vorn los. Ein Fehler beim Nachladen lässt die bisherigen Daten stehen - die Diashow läuft weiter.
// reload(): sofort neu (z. B. wenn viele Fotos nicht laden, weil ihre Adressen abgelaufen sind).
export default function usePeriodicLoad(loader, { intervalMs, key = '' }) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState((current) => ({ ...current, loading: true }))
    Promise.resolve()
      .then(() => loaderRef.current())
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false })
      })
      .catch((error) => {
        if (!cancelled) setState((current) => ({ ...current, error, loading: false }))
      })
    const timer = setTimeout(() => setTick((value) => value + 1), intervalMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, tick, intervalMs])

  const reload = useCallback(() => setTick((value) => value + 1), [])
  return { ...state, reload }
}

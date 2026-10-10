import { useRef, useState } from 'react'
import { api } from '../../api'

export const DEFAULT_RADIUS = 25
export const START_SUCHE = { q: '', typ: null, plz: null, radius: DEFAULT_RADIUS }
const EMPTY = { deutschlandweit: [], treffer: [], gesamt: 0, seite: 1, mehr: false }

// Nur echte Einträge (Objekte) - alles andere aus der Antwort fällt weg.
function cards(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && typeof item.slug === 'string') : []
}

function normalize(data) {
  const source = data && typeof data === 'object' ? data : {}
  return {
    deutschlandweit: cards(source.deutschlandweit),
    treffer: cards(source.treffer),
    gesamt: Number.isInteger(source.gesamt) ? source.gesamt : 0,
    seite: Number.isInteger(source.seite) ? source.seite : 1,
    mehr: source.mehr === true
  }
}

function requestParams({ q, typ, plz, radius }, seite) {
  return { q: q || undefined, typ: typ || undefined, plz: plz || undefined, radius: plz ? radius : undefined, seite: seite > 1 ? seite : undefined }
}

// Laden fürs öffentliche Entdecken (api.publicEntdecken): load(suche) ersetzt die Treffer, loadMore() hängt die nächste
// Seite an. Eine ältere Antwort, die nach einer neueren eintrifft, wird verworfen.
export default function useEntdecken() {
  const [result, setResult] = useState(EMPTY)
  const [applied, setApplied] = useState(START_SUCHE)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const latest = useRef(0)

  async function load(suche) {
    const id = ++latest.current
    setLoading(true)
    setLoadingMore(false)
    setError(null)
    try {
      const data = normalize(await api.publicEntdecken(requestParams(suche, 1)))
      if (id !== latest.current) return
      setResult(data)
      setApplied(suche)
    } catch (err) {
      if (id !== latest.current) return
      setError(err.message)
      setResult(EMPTY)
    } finally {
      if (id === latest.current) setLoading(false)
    }
  }

  async function loadMore() {
    const id = ++latest.current
    setLoadingMore(true)
    try {
      const data = normalize(await api.publicEntdecken(requestParams(applied, result.seite + 1)))
      if (id !== latest.current) return
      setResult((current) => ({ ...data, deutschlandweit: current.deutschlandweit, treffer: [...current.treffer, ...data.treffer] }))
    } catch (err) {
      if (id === latest.current) setError(err.message)
    } finally {
      if (id === latest.current) setLoadingMore(false)
    }
  }

  return { result, applied, loading, loadingMore, error, setError, load, loadMore }
}

import { useCallback } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

// Phase W: gewählter Reiter einer Seite in der Adresse (?ansicht=… auf Tiere, ?reiter=… auf der Gruppenseite) - so lässt
// sich ein Reiter verlinken (alte Adressen, lib/legacyRoutes.js) und Zurück bleibt ruhig (replace, wie Entdecken und
// Einstellungen). Der erste Reiter (fallback) steht ohne Parameter; unbekannte Werte landen dort. drop: Parameter, die
// zu einem anderen Reiter gehören und beim Wechsel wegfallen (z. B. ?ansicht der Tiere, wenn die Gruppenseite den
// Reiter wechselt). Der Zustand der Adresse (location.state, z. B. "from" für den Zurück-Link der Tierseite) bleibt beim
// Wechsel erhalten.
export default function useTabParam(param, tabs, { fallback = tabs[0]?.key, drop = [] } = {}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { state } = useLocation()
  const wanted = searchParams.get(param)
  const current = tabs.some((tab) => tab.key === wanted) ? wanted : fallback
  const dropKey = drop.join(',')

  const select = useCallback(
    (key) => {
      setSearchParams(
        (existing) => {
          const next = new URLSearchParams(existing)
          if (key === fallback) next.delete(param)
          else next.set(param, key)
          for (const name of dropKey ? dropKey.split(',') : []) next.delete(name)
          return next
        },
        { replace: true, state }
      )
    },
    [setSearchParams, param, fallback, dropKey, state]
  )

  return [current, select, wanted]
}

import { useEffect, useState } from 'react'
import { api } from '../api'
import { friendHomes } from '../lib/familyGroups.js'

// Befreundete Zuhause für die Familienbande (Phase V3): die Besuche in beiden Richtungen (GET /api/besuche) und die
// Namen ihrer Tiere aus der "Erlebt mit"-Liste (GET /api/erlebt-mit/tiere) - beides gibt es nur im eigenen Zuhause,
// darum nur mit enabled. null: lädt noch bzw. abgeschaltet. Schlägt eine Anfrage fehl, bleibt der Abschnitt einfach
// weg (leere Liste) - die Familien darüber stehen trotzdem.
export default function useFriendHomes(enabled) {
  const [homes, setHomes] = useState(null)
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    Promise.resolve()
      .then(() => Promise.all([api.visits(), api.erlebtMitTiere()]))
      .then(([visits, tiere]) => {
        if (!cancelled) setHomes(friendHomes(visits, Array.isArray(tiere) ? tiere : []))
      })
      .catch(() => {
        if (!cancelled) setHomes([])
      })
    return () => {
      cancelled = true
    }
  }, [enabled])
  return enabled ? homes : null
}

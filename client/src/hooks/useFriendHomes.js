import { useEffect, useState } from 'react'
import { api } from '../api'
import { friendHomes } from '../lib/familyGroups.js'

// Befreundete Zuhause für die leise Zeile unter der Familienbande (Familienbande 2): die Besuche in beiden Richtungen
// (GET /api/besuche) - die gibt es nur im eigenen Zuhause, darum nur mit enabled. null: lädt noch bzw. abgeschaltet.
// Schlägt die Anfrage fehl, fehlt nur dieser Teil der Zeile (leere Liste) - das Raster darüber steht trotzdem.
export default function useFriendHomes(enabled) {
  const [homes, setHomes] = useState(null)
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    Promise.resolve()
      .then(() => api.visits())
      .then((visits) => {
        if (!cancelled) setHomes(friendHomes(visits))
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

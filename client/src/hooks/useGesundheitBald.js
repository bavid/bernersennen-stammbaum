import { useEffect, useState } from 'react'
import { api } from '../api'
import { todayIso } from '../lib/dates.js'

// „Gesundheit leicht“ für „Bald“ auf Start (components/start/StartSoon.jsx): die fälligen Termine der eigenen Tiere von
// heute (Gerätedatum) bis 14 Tage (GET /api/gesundheit/bald). Nur im eigenen Zuhause (enabled); fällt die Abfrage aus,
// bleibt die Liste leer - „Bald“ zeigt dann einfach den Rest.
export default function useGesundheitBald(enabled) {
  const [items, setItems] = useState([])
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    Promise.resolve()
      .then(() => api.gesundheitBald(todayIso()))
      .then((data) => !cancelled && setItems(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setItems([]))
    return () => {
      cancelled = true
    }
  }, [enabled])
  return enabled ? items : []
}

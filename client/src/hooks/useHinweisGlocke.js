import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import useHinweisAktionen from './useHinweisAktionen.js'
import { isReadOnly } from '../lib/demo.js'
import { isOwnHome } from '../lib/visits.js'
import { REFRESH_MS, hinweisZahlen, withHinweisZahlen } from '../lib/glocke.js'

// Daten der Hinweis-Glocke (components/hinweise, lib/glocke.js) - EIN Hook für alle drei Quellen. Die Zahlen stehen in
// /me (family) und werden nur dort geändert (onFamilyChange: setFamily aus App.jsx), die Listen holt der Hook erst, wenn
// die Glocke aufgeht. Kein Abfragesturm: beim Laden reicht /me, danach höchstens alle REFRESH_MS eine leichte Anfrage
// (GET /api/hinweise/gruesse bringt alle drei Zahlen mit) - nur bei sichtbarem Tab und nur im eigenen Zuhause (die
// Endpunkte gibt es nur dort; in einer Familie oder zu Besuch zeigt die Glocke nur die Zahl aus /me).
// Demo und Admin-Ansicht lesen nur: „gesehen“ gilt dort nur für diese Sitzung (seenLocally), Aktionen sind gesperrt.
// Die Aktionen (Ja/Nein, Passt/Entfernen) und ihre Rückmeldung im Fenster: hooks/useHinweisAktionen.js.
export default function useHinweisGlocke({ family, onFamilyChange }) {
  const atHome = isOwnHome(family)
  const readOnly = isReadOnly(family)
  const [lists, setLists] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const seenLocally = useRef(false)
  const lastRefresh = useRef(0)
  const mounted = useRef(true)

  // /me kam gerade erst - die erste eigene Nachfrage frühestens nach REFRESH_MS.
  useEffect(() => {
    mounted.current = true
    lastRefresh.current = Date.now()
    return () => {
      mounted.current = false
    }
  }, [])

  // patch: ein Teil der Zahlen - oder eine Funktion der aktuellen Zahlen (z. B. eins weniger).
  const patchZahlen = useCallback(
    (patch) =>
      onFamilyChange?.((current) => {
        const zahlen = hinweisZahlen(current)
        const next = { ...zahlen, ...(typeof patch === 'function' ? patch(zahlen) : patch) }
        return withHinweisZahlen(current, readOnly && seenLocally.current ? { ...next, gruesse: 0 } : next)
      }),
    [onFamilyChange, readOnly]
  )

  const aktionen = useHinweisAktionen({ setLists, patchZahlen, mounted })

  const markSeen = useCallback(async () => {
    if (readOnly) {
      seenLocally.current = true
      patchZahlen({ gruesse: 0 })
      return
    }
    try {
      const { zahlen } = await api.hinweiseGelesen()
      patchZahlen(zahlen)
    } catch {
      // Nicht schlimm: die Grüße bleiben dann noch einmal „neu“.
    }
  }, [patchZahlen, readOnly])

  // Leise nachfragen: nur die Zahlen (und die Grüße, falls die Liste schon offen war). Fehler lassen alles stehen.
  const refresh = useCallback(async () => {
    if (!atHome) return
    lastRefresh.current = Date.now()
    try {
      const result = await api.hinweisGruesse()
      if (!mounted.current) return
      patchZahlen(result.zahlen)
      setLists((current) => (current ? { ...current, gruesse: result.gruesse } : current))
    } catch {
      // Die Glocke ist ein Zusatz - kein Fehler soll die Seite stören.
    }
  }, [atHome, patchZahlen])

  useEffect(() => {
    if (!atHome) return undefined
    function tick() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastRefresh.current < REFRESH_MS) return
      refresh()
    }
    const timer = setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [atHome, refresh])

  // Beim Öffnen: alle drei Listen, danach gelten die Grüße als gesehen (sie stehen in dieser Liste trotzdem noch als neu).
  const { resetFeedback } = aktionen
  const loadLists = useCallback(async () => {
    if (!atHome) return
    setLoading(true)
    setError(null)
    resetFeedback()
    lastRefresh.current = Date.now()
    try {
      const [anfragen, besuche, gruss] = await Promise.all([api.erlebtMitOffen(), api.visits(), api.hinweisGruesse()])
      if (!mounted.current) return
      setLists({ anfragen, gaeste: (besuche?.gaeste || []).filter((guest) => guest.neu), gruesse: gruss.gruesse })
      patchZahlen(gruss.zahlen)
      if (gruss.gruesse.some((greeting) => greeting.neu)) markSeen()
    } catch (err) {
      if (mounted.current) setError(err.message)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [atHome, markSeen, patchZahlen, resetFeedback])

  return { atHome, readOnly, lists, loading, error, loadLists, ...aktionen }
}

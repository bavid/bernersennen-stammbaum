import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useToast } from '../components/Toast.jsx'
import { isReadOnly } from '../lib/demo.js'
import { genitive } from '../lib/timeline.js'
import { isOwnHome } from '../lib/visits.js'
import { REFRESH_MS, hinweisZahlen, withHinweisZahlen } from '../lib/glocke.js'

// Daten der Hinweis-Glocke (components/hinweise, lib/glocke.js) - EIN Hook für alle drei Quellen. Die Zahlen stehen in
// /me (family) und werden nur dort geändert (onFamilyChange: setFamily aus App.jsx), die Listen holt der Hook erst, wenn
// die Glocke aufgeht. Kein Abfragesturm: beim Laden reicht /me, danach höchstens alle REFRESH_MS eine leichte Anfrage
// (GET /api/hinweise/gruesse bringt alle drei Zahlen mit) - nur bei sichtbarem Tab und nur im eigenen Zuhause (die
// Endpunkte gibt es nur dort; in einer Familie oder zu Besuch zeigt die Glocke nur die Zahl aus /me).
// Demo und Admin-Ansicht lesen nur: „gesehen“ gilt dort nur für diese Sitzung (seenLocally), Aktionen sind gesperrt.
export default function useHinweisGlocke({ family, onFamilyChange }) {
  const toast = useToast()
  const atHome = isOwnHome(family)
  const readOnly = isReadOnly(family)
  const [lists, setLists] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const seenLocally = useRef(false)
  // /me kam gerade erst - die erste eigene Nachfrage frühestens nach REFRESH_MS.
  const lastRefresh = useRef(Date.now())
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
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
  const loadLists = useCallback(async () => {
    if (!atHome) return
    setLoading(true)
    setError(null)
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
  }, [atHome, markSeen, patchZahlen])

  // Eine Aktion: busy sperrt die Knöpfe dieses Hinweises, ein Fehler kommt als Hinweis unten (Toast).
  const run = useCallback(
    async (key, action) => {
      setBusy(key)
      try {
        await action()
      } catch (err) {
        toast(err.message)
      } finally {
        if (mounted.current) setBusy(null)
      }
    },
    [toast]
  )

  const dropRequests = (keep) => setLists((current) => (current ? { ...current, anfragen: current.anfragen.filter(keep) } : current))
  const dropGuest = (guest) => setLists((current) => (current ? { ...current, gaeste: current.gaeste.filter((g) => g.id !== guest.id) } : current))

  const decide = (request, confirm) =>
    run(`anfrage-${request.requestId}`, async () => {
      const result = confirm ? await api.confirmErlebtMit(request.requestId) : await api.rejectErlebtMit(request.requestId)
      dropRequests((r) => r.requestId !== request.requestId)
      patchZahlen({ anfragen: result.offen })
      toast(confirm ? `Steht jetzt auch in ${genitive(request.dogName)} Chronik` : 'Markierung entfernt')
    })

  // „Alle von {Zuhause} ablehnen“ (security-review V2, L-3) - gegen eine Flut von Anfragen eines Zuhauses.
  const rejectAllFrom = (group) =>
    run(`zuhause-${group.zuhauseId}`, async () => {
      const result = await api.rejectAllErlebtMitFrom(group.zuhauseId)
      dropRequests((r) => r.zuhauseId !== group.zuhauseId)
      patchZahlen({ anfragen: result.offen })
      toast(`${result.abgelehnt} Anfragen von „${group.zuhause}“ abgelehnt`)
    })

  // Neuer Gast (security-review V2, M-3): bleibt, bis „Passt“ oder „Entfernen“.
  const acknowledgeGuest = (guest) =>
    run(`gast-${guest.id}`, async () => {
      const me = await api.acknowledgeGuest(guest.id)
      dropGuest(guest)
      patchZahlen({ gaeste: hinweisZahlen(me).gaeste })
    })

  const removeGuest = (guest) =>
    run(`gast-${guest.id}`, async () => {
      await api.removeGuest(guest.id)
      dropGuest(guest)
      patchZahlen((zahlen) => ({ gaeste: Math.max(0, zahlen.gaeste - 1) }))
      toast(`„${guest.name}“ ist nicht mehr bei euch zu Gast`)
    })

  return {
    atHome,
    readOnly,
    lists,
    loading,
    error,
    busy,
    loadLists,
    actions: { confirm: (r) => decide(r, true), reject: (r) => decide(r, false), rejectAllFrom, acknowledgeGuest, removeGuest }
  }
}

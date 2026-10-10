import { useCallback, useState } from 'react'
import { api } from '../api'
import { genitive } from '../lib/timeline.js'
import { hinweisZahlen } from '../lib/glocke.js'
import { t } from '../lib/i18n/index.js'
import { WWH } from '../lib/wirWarenHierText.js'

// Aktionen im Fenster der Hinweis-Glocke (hooks/useHinweisGlocke.js): „Mit dabei“ Ja/Nein und „alle von … ablehnen“, neue
// Gäste Passt/Entfernen, „Wir waren hier“-Kontaktwünsche Annehmen/Ablehnen. Die Rückmeldung steht IM Fenster (feedback: { kind: 'ok' | 'error', text }) - am Handy liegt das
// Blatt als modaler Dialog über allem, ein Toast darunter bliebe unsichtbar. busy: die Schlüssel der Hinweise, für die
// gerade eine Aktion läuft (mehrere gleichzeitig möglich). setLists/patchZahlen/mounted: vom Glocken-Hook.
export default function useHinweisAktionen({ setLists, patchZahlen, mounted }) {
  const [busy, setBusy] = useState([])
  const [feedback, setFeedback] = useState(null)

  const resetFeedback = useCallback(() => setFeedback(null), [])
  const isBusy = (key) => busy.includes(key)

  // true, wenn die Aktion geklappt hat (der Annehmen-Dialog schließt nur dann).
  async function run(key, action) {
    if (busy.includes(key)) return false
    setBusy((current) => [...current, key])
    setFeedback(null)
    try {
      const text = await action()
      if (mounted.current && text) setFeedback({ kind: 'ok', text })
      return true
    } catch (err) {
      if (mounted.current) setFeedback({ kind: 'error', text: err.message })
      return false
    } finally {
      if (mounted.current) setBusy((current) => current.filter((k) => k !== key))
    }
  }

  const dropRequests = (keep) => setLists((current) => (current ? { ...current, anfragen: current.anfragen.filter(keep) } : current))
  const dropGuest = (guest) => setLists((current) => (current ? { ...current, gaeste: current.gaeste.filter((g) => g.id !== guest.id) } : current))

  const decide = (request, confirm) =>
    run(`anfrage-${request.requestId}`, async () => {
      const result = confirm ? await api.confirmErlebtMit(request.requestId) : await api.rejectErlebtMit(request.requestId)
      dropRequests((r) => r.requestId !== request.requestId)
      patchZahlen({ anfragen: result.offen })
      return confirm
        ? t('Steht jetzt auch in {genitiv} Chronik', { genitiv: genitive(request.dogName), name: request.dogName })
        : t('Markierung entfernt')
    })

  // „Alle von {Zuhause} ablehnen“ (security-review V2, L-3) - gegen eine Flut von Anfragen eines Zuhauses.
  const rejectAllFrom = (group) =>
    run(`zuhause-${group.zuhauseId}`, async () => {
      const result = await api.rejectAllErlebtMitFrom(group.zuhauseId)
      dropRequests((r) => r.zuhauseId !== group.zuhauseId)
      patchZahlen({ anfragen: result.offen })
      return t('{n} Anfragen von „{zuhause}“ abgelehnt', { n: result.abgelehnt, zuhause: group.zuhause })
    })

  // Neuer Gast (security-review V2, M-3): bleibt, bis „Passt“ oder „Entfernen“.
  const acknowledgeGuest = (guest) =>
    run(`gast-${guest.id}`, async () => {
      const me = await api.acknowledgeGuest(guest.id)
      dropGuest(guest)
      patchZahlen({ gaeste: hinweisZahlen(me).gaeste })
      return t('„{name}“ ist bei euch willkommen', { name: guest.name })
    })

  const removeGuest = (guest) =>
    run(`gast-${guest.id}`, async () => {
      await api.removeGuest(guest.id)
      dropGuest(guest)
      patchZahlen((zahlen) => ({ gaeste: Math.max(0, zahlen.gaeste - 1) }))
      return t('„{name}“ ist nicht mehr bei euch zu Gast', { name: guest.name })
    })

  // Kontaktwunsch (lib/wwhKontakt.js): Annehmen legt einen bestätigten Besuch an - die Gäste-Zahl bleibt also gleich.
  const dropWish = (wish) =>
    setLists((current) => (current ? { ...current, kontakte: (current.kontakte || []).filter((w) => w.id !== wish.id) } : current))
  const decideWish = (wish, accept) =>
    run(`kontakt-${wish.id}`, async () => {
      if (accept) await api.wwhKontaktAnnehmen(wish.id)
      else await api.wwhKontaktAblehnen(wish.id)
      dropWish(wish)
      patchZahlen((zahlen) => ({ kontakte: Math.max(0, zahlen.kontakte - 1) }))
      return t(accept ? WWH.angenommen : WWH.wunschAbgelehnt)
    })

  return {
    busy,
    isBusy,
    feedback,
    resetFeedback,
    actions: {
      confirm: (r) => decide(r, true),
      reject: (r) => decide(r, false),
      rejectAllFrom,
      acknowledgeGuest,
      removeGuest,
      acceptWish: (wish) => decideWish(wish, true),
      rejectWish: (wish) => decideWish(wish, false)
    }
  }
}

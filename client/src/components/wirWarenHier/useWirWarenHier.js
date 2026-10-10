import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { WWH, wwhErrorText } from '../../lib/wirWarenHierText.js'
import { t } from '../../lib/i18n/index.js'

const NO_WISHES = Object.freeze({ an: [], von: [] })
const TITLE_ID = 'wwh-title'

// Fokus auf die Abschnittsüberschrift (tabIndex -1), wenn der Knopf einer Aktion danach verschwindet.
export function focusWwhTitle() {
  document.getElementById(TITLE_ID)?.focus()
}

function listOf(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

// Kontaktwünsche nur dieses Ortes - zugeordnet über die Ort-Id (Namen können sich doppeln).
function wishesAt(data, partnerId) {
  const at = (list) => listOf(list).filter((wish) => wish.partnerId === partnerId)
  return { an: at(data?.an), von: at(data?.von) }
}

// Daten und Aktionen des Abschnitts „Wir waren hier“ auf einer Partnerseite: Ortsansicht (eigene Anmeldungen, andere
// Tiere), die eigenen Tiere zum Anmelden und die Kontaktwünsche dieses Ortes. run(aktion, meldung) führt eine Aktion
// aus, sagt das Ergebnis an (notice, aria-live) bzw. zeigt den Fehler und lädt danach neu.
export default function useWirWarenHier(partnerId) {
  const [view, setView] = useState(undefined) // undefined: lädt, null: Ort nicht verfügbar
  const [dogs, setDogs] = useState([])
  const [wishes, setWishes] = useState(NO_WISHES)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState(null)
  const alive = useRef(true)
  const seq = useRef(0) // je Ladevorgang eine Nummer: eine überholte Antwort wird verworfen

  const load = useCallback(async () => {
    const id = ++seq.current
    const current = () => alive.current && id === seq.current
    try {
      const [ort, ownDogs, open] = await Promise.all([
        api.wwhOrt(partnerId),
        api.listDogs().catch(() => []),
        api.wwhKontaktOffen().catch(() => NO_WISHES)
      ])
      if (!current()) return
      setView({ ort: ort.ort, eigene: listOf(ort.eigene), andere: listOf(ort.andere) })
      setDogs(listOf(ownDogs).filter((dog) => dog.can_edit))
      setWishes(wishesAt(open, Number(partnerId)))
    } catch (err) {
      if (!current()) return
      // Scheitert nur das Neuladen nach einer Aktion, bleibt die geladene Ansicht stehen - nur der Fehler kommt dazu.
      setView((cur) => (cur === undefined ? null : cur))
      setError(err?.status === 404 ? t(WWH.ortFehlt) : wwhErrorText(err))
    }
  }, [partnerId])

  useEffect(() => {
    alive.current = true
    load()
    return () => {
      alive.current = false
      seq.current += 1
    }
  }, [load])

  const run = useCallback(
    async (action, success) => {
      setBusy(true)
      setError(null)
      setNotice('')
      try {
        await action()
        if (!alive.current) return false
        setNotice(success)
        await load()
        return true
      } catch (err) {
        if (alive.current) setError(wwhErrorText(err))
        return false
      } finally {
        if (alive.current) setBusy(false)
      }
    },
    [load]
  )

  return { view, dogs, wishes, busy, notice, error, run }
}

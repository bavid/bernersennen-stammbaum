import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { WWH, wwhErrorText } from '../../lib/wirWarenHierText.js'
import { t } from '../../lib/i18n/index.js'

const NO_WISHES = Object.freeze({ an: [], von: [] })

function listOf(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

// Kontaktwünsche nur dieses Ortes (die Antwort nennt den Ort beim Namen, nie die Id).
function wishesAt(data, ortName) {
  const at = (list) => listOf(list).filter((wish) => wish.ortName === ortName)
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

  const load = useCallback(async () => {
    try {
      const [ort, ownDogs, open] = await Promise.all([
        api.wwhOrt(partnerId),
        api.listDogs().catch(() => []),
        api.wwhKontaktOffen().catch(() => NO_WISHES)
      ])
      if (!alive.current) return
      setView({ ort: ort.ort, eigene: listOf(ort.eigene), andere: listOf(ort.andere) })
      setDogs(listOf(ownDogs).filter((dog) => dog.can_edit))
      setWishes(wishesAt(open, ort.ort?.name))
    } catch (err) {
      if (!alive.current) return
      setView(null)
      setError(err?.status === 404 ? t(WWH.ortFehlt) : wwhErrorText(err))
    }
  }, [partnerId])

  useEffect(() => {
    alive.current = true
    load()
    return () => {
      alive.current = false
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

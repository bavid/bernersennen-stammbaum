import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useHinweisGlocke from '../../hooks/useHinweisGlocke.js'
import { isHouseholdIdentity } from '../../lib/areas.js'
import { hinweisTotal, hinweisZahlen } from '../../lib/glocke.js'

const GlockeContext = createContext(null)
// /start?hinweise=offen (Ziel der Push-Nachricht zu einem Kontaktwunsch, server/lib/push.js) öffnet gleich die Glocke.
const OPEN_PARAM = 'hinweise'
const OPEN_VALUE = 'offen'

function openerFrom(event) {
  const target = event?.currentTarget
  if (target instanceof HTMLElement) return target
  const current = document.activeElement
  return current instanceof HTMLElement && current !== document.body ? current : null
}

// Gemeinsamer Zustand der Hinweis-Glocke (App.jsx, um Kopf und Seiten): die Glocke im Kopf (HinweisGlocke) öffnet das
// Fenster - Start zeigt keine eigene Hinweis-Zeile (Wunsch 04.10.: „Notification oben rechts reicht“). Nur für Haushalte (eigenes Zuhause, auch in einer
// Familie oder zu Besuch - die Zahlen gehören der Identität); klassische Familien-Logins, Tierheime und Partner haben
// keine Glocke. opener: wer das Fenster geöffnet hat (der geklickte Knopf) - beim Schließen geht der Fokus dorthin
// zurück, außer es schließt, weil ein Link auf eine andere Seite führt (closePanel({ restoreFocus: false })).
export default function HinweiseProvider({ family, onFamilyChange, children }) {
  const glocke = useHinweisGlocke({ family, onFamilyChange })
  const enabled = isHouseholdIdentity(family)
  const total = hinweisTotal(hinweisZahlen(family))
  const [open, setOpen] = useState(false)
  const opener = useRef(null)
  const restoreFocus = useRef(true)

  const openPanel = useCallback((event) => {
    opener.current = openerFrom(event)
    restoreFocus.current = true
    setOpen(true)
  }, [])
  const closePanel = useCallback(({ restoreFocus: restore = true } = {}) => {
    restoreFocus.current = restore
    setOpen(false)
  }, [])

  const [searchParams, setSearchParams] = useSearchParams()
  const openFromUrl = enabled && searchParams.get(OPEN_PARAM) === OPEN_VALUE
  useEffect(() => {
    if (!openFromUrl) return
    setOpen(true)
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete(OPEN_PARAM)
        return next
      },
      { replace: true }
    )
  }, [openFromUrl, setSearchParams])

  const { loadLists } = glocke
  useEffect(() => {
    if (open) loadLists()
  }, [open, loadLists])

  const value = { ...glocke, enabled, total, open, openPanel, closePanel, opener, restoreFocus }
  return <GlockeContext.Provider value={value}>{children}</GlockeContext.Provider>
}

// null außerhalb des Providers (z. B. ein Test, der nur den Kopf zeigt) - dann gibt es keine Glocke.
export function useGlocke() {
  return useContext(GlockeContext)
}

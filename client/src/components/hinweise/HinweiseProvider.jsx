import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import useHinweisGlocke from '../../hooks/useHinweisGlocke.js'
import { isHouseholdIdentity } from '../../lib/areas.js'
import { hinweisTotal, hinweisZahlen } from '../../lib/glocke.js'

const GlockeContext = createContext(null)

// Gemeinsamer Zustand der Hinweis-Glocke (App.jsx, um Kopf und Seiten): die Glocke im Kopf (HinweisGlocke) und die
// schmale Zeile auf Start (HinweisStartZeile) öffnen dasselbe Fenster. Nur für Haushalte (eigenes Zuhause, auch in einer
// Familie oder zu Besuch - die Zahlen gehören der Identität); klassische Familien-Logins, Tierheime und Partner haben
// keine Glocke. opener: wer das Fenster geöffnet hat - beim Schließen geht der Fokus dorthin zurück.
export default function HinweiseProvider({ family, onFamilyChange, children }) {
  const glocke = useHinweisGlocke({ family, onFamilyChange })
  const enabled = isHouseholdIdentity(family)
  const total = hinweisTotal(hinweisZahlen(family))
  const [open, setOpen] = useState(false)
  const opener = useRef(null)

  const openPanel = useCallback(() => {
    const current = document.activeElement
    opener.current = current instanceof HTMLElement && current !== document.body ? current : null
    setOpen(true)
  }, [])
  const closePanel = useCallback(() => setOpen(false), [])

  const { loadLists } = glocke
  useEffect(() => {
    if (open) loadLists()
  }, [open, loadLists])

  const value = useMemo(
    () => ({ ...glocke, enabled, total, open, openPanel, closePanel, opener }),
    [glocke, enabled, total, open, openPanel, closePanel]
  )
  return <GlockeContext.Provider value={value}>{children}</GlockeContext.Provider>
}

// null außerhalb des Providers (z. B. ein Test, der nur den Kopf zeigt) - dann gibt es keine Glocke.
export function useGlocke() {
  return useContext(GlockeContext)
}

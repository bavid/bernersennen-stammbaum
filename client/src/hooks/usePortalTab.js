import { useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { OVERVIEW_TAB, PORTAL_TAB_PARAM, resolvePortalTab } from '../lib/portalTabs.js'

// Gewählter Reiter im Partner-Portal: in der Adresse (?reiter=termine, die Übersicht ohne Parameter) - öffentlich auf
// /p/:slug ebenso wie in der Kundensicht (/kundensicht?ansicht=portal&reiter=termine). Jeder Wechsel per Klick ist ein
// eigener Eintrag im Verlauf: "Zurück" führt zum vorigen Reiter, ein geteilter Link öffnet genau diesen. Wer mit den
// Pfeiltasten durch die Leiste geht (TabBar meldet { keyboard: true }), legt dafür nur EINEN Eintrag an - die weiteren
// Schritte ersetzen ihn. Andere Parameter (?demo=1, ?ansicht=portal) bleiben stehen; eine alte Sprungmarke (#kontakt)
// gilt nur bis zum ersten Wechsel, ebenso ein ungültiger Wert (?reiter=quatsch) - beides fällt ohne neuen Eintrag weg.
// keys: die sichtbaren Reiter (lib/portalTabs.js portalTabs) - ein unbekannter oder leerer Reiter wird die Übersicht.
export default function usePortalTab(keys) {
  const { pathname, search, hash } = useLocation()
  const navigate = useNavigate()
  const keyboardRun = useRef(false)
  const tab = resolvePortalTab({ param: new URLSearchParams(search).get(PORTAL_TAB_PARAM), hash, keys })

  const selectTab = useCallback(
    (key, { keyboard = false } = {}) => {
      const params = new URLSearchParams(search)
      if (key === OVERVIEW_TAB) params.delete(PORTAL_TAB_PARAM)
      else params.set(PORTAL_TAB_PARAM, key)
      const next = params.toString()
      const nextSearch = next ? `?${next}` : ''
      const continuesRun = keyboard && keyboardRun.current
      keyboardRun.current = keyboard
      if (nextSearch === search && !hash) return
      navigate({ pathname, search: nextSearch }, { replace: key === tab || continuesRun })
    },
    [tab, hash, search, pathname, navigate]
  )

  return [tab, selectTab]
}

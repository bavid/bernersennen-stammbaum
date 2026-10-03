import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { OVERVIEW_TAB, PORTAL_TAB_PARAM, resolvePortalTab } from '../lib/portalTabs.js'

// Gewählter Reiter im Partner-Portal: in der Adresse (?reiter=termine, die Übersicht ohne Parameter) - öffentlich auf
// /p/:slug ebenso wie in der Kundensicht (/kundensicht?ansicht=portal&reiter=termine). Jeder Wechsel ist ein eigener
// Eintrag im Verlauf: "Zurück" führt zum vorigen Reiter, ein geteilter Link öffnet genau diesen. Andere Parameter
// (?demo=1, ?ansicht=portal) bleiben stehen; eine alte Sprungmarke (#kontakt) gilt nur bis zum ersten Wechsel.
// keys: die sichtbaren Reiter (lib/portalTabs.js portalTabs) - ein unbekannter oder leerer Reiter wird die Übersicht.
export default function usePortalTab(keys) {
  const { pathname, search, hash } = useLocation()
  const navigate = useNavigate()
  const tab = resolvePortalTab({ param: new URLSearchParams(search).get(PORTAL_TAB_PARAM), hash, keys })

  const selectTab = useCallback(
    (key) => {
      if (key === tab && !hash) return
      const params = new URLSearchParams(search)
      if (key === OVERVIEW_TAB) params.delete(PORTAL_TAB_PARAM)
      else params.set(PORTAL_TAB_PARAM, key)
      const next = params.toString()
      navigate({ pathname, search: next ? `?${next}` : '' })
    },
    [tab, hash, search, pathname, navigate]
  )

  return [tab, selectTab]
}

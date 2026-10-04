import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ALL_TAB, TAB_PARAM, tabFromParam } from '../lib/discoverTabs.js'

// Gewählter Reiter in "Entdecken" (Phase U): öffentlich in der Adresse (?bereich=, "Alle" ohne Parameter) -
// so lässt sich ein Bereich verlinken und der Zurück-Knopf bleibt ruhig (replace). In der Kundensicht
// (preview) nur im State, damit die Vorschau die Adresse von /kundensicht nicht verändert - dort öffnet sie im
// Bereich der eigenen Karte (initialTab, lib/discoverTabs.js ownSectionTab).
export default function useDiscoverTab(preview, initialTab = ALL_TAB) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [localTab, setLocalTab] = useState(() => tabFromParam(initialTab, { preview }))
  const tab = preview ? localTab : tabFromParam(searchParams.get(TAB_PARAM))

  function selectTab(key) {
    const next = tabFromParam(key, { preview })
    if (preview) {
      setLocalTab(next)
      return
    }
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        if (next === ALL_TAB) params.delete(TAB_PARAM)
        else params.set(TAB_PARAM, next)
        return params
      },
      { replace: true }
    )
  }

  return [tab, selectTab]
}

import { useSearchParams } from 'react-router-dom'
import { OVERVIEW_TAB, TAB_PARAM, adminTabFromParam } from '../lib/adminTabs.js'

// Gewählter Reiter im Admin (Phase U): in der Adresse (?tab=, "Übersicht" ohne Parameter) - so lässt sich ein
// Reiter verlinken und bleibt beim Neuladen stehen; der Wechsel ersetzt den Eintrag im Verlauf (wie Entdecken).
export default function useAdminTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = adminTabFromParam(searchParams.get(TAB_PARAM))

  function selectTab(key) {
    const next = adminTabFromParam(key)
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        if (next === OVERVIEW_TAB) params.delete(TAB_PARAM)
        else params.set(TAB_PARAM, next)
        return params
      },
      { replace: true }
    )
  }

  return [tab, selectTab]
}

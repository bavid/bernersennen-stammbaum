import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'

export const CUSTOMER_VIEW_ROUTE = '/kundensicht'
const DEFAULT_EDIT_ROUTE = '/profil'

// Umschalter "Bearbeiten | Kundensicht" (Phase P1) über jeder Seite eines Partner- oder Tierheim-
// Bereichs (App.jsx, direkt unter dem Kopf). Zwei echte Links, der aktive mit aria-current. "Bearbeiten"
// führt zurück zur zuletzt besuchten Seite außerhalb der Kundensicht (Vorgabe: /profil) - der Umschalter
// lebt außerhalb von <main key=…> und merkt sich den Pfad deshalb über Seitenwechsel hinweg, aber nur
// für den Bereich areaId: nach einem Bereichswechsel gilt wieder die Vorgabe.
// Audit V7a: gemerkt wird der Pfad samt Suche - so landet "Bearbeiten" wieder im zuletzt offenen Profil-Reiter (?reiter=…).
export default function ViewModeSwitch({ areaId }) {
  const { pathname, search } = useLocation()
  const isCustomerView = pathname === CUSTOMER_VIEW_ROUTE
  const current = `${pathname}${search}`
  const [memory, setMemory] = useState({ areaId, route: DEFAULT_EDIT_ROUTE })

  useEffect(() => {
    if (!isCustomerView) setMemory({ areaId, route: current })
  }, [areaId, current, isCustomerView])

  // Gehört die gemerkte Seite zu einem anderen Bereich, zählt sie schon beim ersten Rendern nicht mehr.
  const lastEditRoute = memory.areaId === areaId ? memory.route : DEFAULT_EDIT_ROUTE
  const editRoute = isCustomerView ? lastEditRoute : current

  return (
    <div className="view-mode-bar">
      <nav className="segmented view-mode-switch" aria-label="Ansicht">
        <Link to={editRoute} aria-current={isCustomerView ? undefined : 'page'}>
          <Icon name="edit" />
          Bearbeiten
        </Link>
        <Link to={CUSTOMER_VIEW_ROUTE} aria-current={isCustomerView ? 'page' : undefined}>
          <Icon name="eye" />
          Kundensicht
        </Link>
      </nav>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'

export const CUSTOMER_VIEW_ROUTE = '/kundensicht'
const DEFAULT_EDIT_ROUTE = '/profil'

// Umschalter "Bearbeiten | Kundensicht" (Phase P1) über jeder Seite eines Partner- oder Tierheim-
// Bereichs (App.jsx, direkt unter dem Kopf). Zwei echte Links, der aktive mit aria-current. "Bearbeiten"
// führt zurück zur zuletzt besuchten Seite außerhalb der Kundensicht (Vorgabe: /profil) - der Umschalter
// lebt außerhalb von <main key=…> und merkt sich den Pfad deshalb über Seitenwechsel hinweg.
export default function ViewModeSwitch() {
  const { pathname } = useLocation()
  const isCustomerView = pathname === CUSTOMER_VIEW_ROUTE
  const [lastEditRoute, setLastEditRoute] = useState(DEFAULT_EDIT_ROUTE)

  useEffect(() => {
    if (!isCustomerView) setLastEditRoute(pathname)
  }, [pathname, isCustomerView])

  const editRoute = isCustomerView ? lastEditRoute : pathname

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

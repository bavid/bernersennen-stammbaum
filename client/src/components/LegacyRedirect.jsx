import { Navigate, useLocation } from 'react-router-dom'
import { legacyTarget } from '../lib/legacyRoutes.js'
import { startRoute } from '../lib/areas.js'

// Phase W: eine alte Adresse (/wegbegleiter, /stammbaum, /familienbande, /pinnwand, /mitglieder) an ihren neuen Ort -
// Query und Hash bleiben (lib/legacyRoutes.js), ebenso der Zustand der Navigation (z. B. state.draft, den die Würfe-Seite
// der Pinnwand mitgibt). kind: Schlüssel in lib/legacyRoutes.js. Ohne Ziel in diesem Kontext zur Startseite.
export default function LegacyRedirect({ family, kind }) {
  const { search, hash, state } = useLocation()
  const target = legacyTarget(kind, family, { search, hash }) || startRoute(family)
  return <Navigate to={target} replace state={state} />
}

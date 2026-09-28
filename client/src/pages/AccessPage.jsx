import AccessSettings from '../components/AccessSettings.jsx'
import { useIsDemo } from '../lib/demo.js'

// /zugang (Phase P) - Schlüssel erneuern und eigene Benutzer-Logins für Partner- und Tierheim-Bereiche.
// Dieselben Einstellungen wie im Einstellungen-Dialog am Stammbaum (FamilySettings), den es dort nicht
// gibt. Ein Partner-Bereich ist immer selbst die Identität (kein Beitreten), nie aber in der Demo.
export default function AccessPage({ family, onFamilyChange }) {
  const isDemo = useIsDemo()

  return (
    <div className="page access-page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">{family.name}</span>
          <h1>Zugang</h1>
          <p className="page-lede">Schlüssel erneuern und eigene Benutzer-Logins verwalten.</p>
        </div>
      </header>

      {isDemo ? (
        <p className="muted">In der Demo nicht möglich.</p>
      ) : (
        <div className="card access-page-card">
          <AccessSettings family={family} onFamilyChange={onFamilyChange} />
        </div>
      )}
    </div>
  )
}

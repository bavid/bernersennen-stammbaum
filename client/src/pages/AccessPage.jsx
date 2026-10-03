import AccessSettings from '../components/AccessSettings.jsx'
import PartnerTelegramSection from '../components/PartnerTelegramSection.jsx'
import { useIsDemo, useReadOnlyHint } from '../lib/demo.js'

// /zugang (Phase P) - Schlüssel erneuern und eigene Benutzer-Logins für Partner- und Tierheim-Bereiche.
// Dieselben Einstellungen wie im Einstellungen-Dialog am Stammbaum (FamilySettings), den es dort nicht
// gibt. Ein Partner-Bereich ist immer selbst die Identität (kein Beitreten), nie aber in der Demo.
// Phase V4b: darunter "Benachrichtigungen" (Telegram-Hinweise, PartnerTelegramSection) - auch in der Demo sichtbar.
export default function AccessPage({ family, onFamilyChange }) {
  const isDemo = useIsDemo()
  const readOnlyHint = useReadOnlyHint()

  return (
    <div className="page access-page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">{family.name}</span>
          <h1>Zugang</h1>
          <p className="page-lede">Schlüssel erneuern, eigene Benutzer-Logins verwalten und Benachrichtigungen einrichten.</p>
        </div>
      </header>

      {isDemo ? (
        <p className="muted">{readOnlyHint}</p>
      ) : (
        <div className="card access-page-card">
          <AccessSettings family={family} onFamilyChange={onFamilyChange} />
        </div>
      )}

      <PartnerTelegramSection />
    </div>
  )
}

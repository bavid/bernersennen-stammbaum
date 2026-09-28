import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { partnerStatusLabel } from '../lib/partnerTypes.js'
import { navItemsFor } from '../lib/navItems.js'

const ACCESS_ROUTE = '/zugang'

// /profil (Phase P) - Platzhalter für das Partner-Profil eines Partner- oder Tierheim-Bereichs: Name und
// Status des Partners (me.partner, server/lib/context.js buildMe). Das eigentliche Bearbeiten folgt im
// nächsten Schritt. Wo "Zugang" nicht in der Hauptnavigation steht (Tierheim), führt ein Link dorthin.
export default function PartnerProfilePage({ family }) {
  const partner = family.partner
  const statusLabel = partnerStatusLabel(partner)
  const statusKey = partner?.gesperrt ? 'gesperrt' : partner?.status
  const showAccessLink = !navItemsFor(family).some((item) => item.to === ACCESS_ROUTE)

  return (
    <div className="page partner-profile-page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">Partner-Profil</span>
          <h1>{partner?.name || family.name}</h1>
          {statusLabel && <span className={`chip partner-status-chip partner-status-${statusKey}`}>{statusLabel}</span>}
          <p className="page-lede">Hier pflegt ihr bald euer Profil.</p>
        </div>
      </header>

      {showAccessLink && (
        <Link to={ACCESS_ROUTE} className="btn btn-ghost">
          <Icon name="lock" />
          Zugang & Schlüssel verwalten
        </Link>
      )}
    </div>
  )
}

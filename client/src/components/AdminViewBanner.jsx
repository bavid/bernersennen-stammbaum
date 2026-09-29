import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'

// Beschriftung der Bereichsart hinter dem Namen (families.art).
const ART_LABELS = { zuhause: 'Zuhause', rudel: 'Familie', tierheim: 'Tierheim-Bereich', partner: 'Partner-Bereich' }

// Band über jeder Seite einer Admin-Ansicht (Phase 5 Task 5b, App.jsx): der Admin liest einen fremden
// Bereich, nichts lässt sich ändern (Server: denyAdminViewWrites). "Zurück zum Admin" lässt die Ansicht
// offen (der Admin-Tab ist meist noch daneben), "Beenden" meldet die Nur-Lesen-Sitzung ab (onEnd).
// Dasselbe Aussehen wie das Demo-Band (layout.css .demo-banner), mit eigener Klasse für die Farbe.
export default function AdminViewBanner({ family, onEnd }) {
  const art = ART_LABELS[family.art]
  return (
    <div className="demo-banner admin-view-banner" role="status">
      <Icon name="eye" />
      <span>
        Admin-Ansicht – nur lesen · <strong>{family.name}</strong>
        {art ? ` (${art})` : ''}
      </span>
      <Link to="/admin" className="btn btn-primary">
        Zurück zum Admin
      </Link>
      <button type="button" className="btn btn-ghost" onClick={onEnd}>
        Beenden
      </button>
    </div>
  )
}

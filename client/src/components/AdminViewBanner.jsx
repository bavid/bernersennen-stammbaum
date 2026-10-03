import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { TopStripSlot } from './TopStrip.jsx'

// Beschriftung der Bereichsart hinter dem Namen (families.art).
const ART_LABELS = { zuhause: 'Zuhause', rudel: 'Familie', tierheim: 'Tierheim-Bereich', partner: 'Partner-Bereich' }

// Hinweis über jeder Seite einer Admin-Ansicht (Phase 5 Task 5b, App.jsx): der Admin liest einen fremden
// Bereich, nichts lässt sich ändern (Server: denyAdminViewWrites). "Zurück zum Admin" lässt die Ansicht
// offen (der Admin-Tab ist meist noch daneben), "Beenden" meldet die Nur-Lesen-Sitzung ab (onEnd).
// Dieselbe schmale Zeile wie der Demo-Hinweis (TopStrip, .demo-banner), mit eigener Klasse für die Farbe.
export default function AdminViewBanner({ family, onEnd }) {
  const art = ART_LABELS[family.art]
  return (
    <TopStripSlot>
      <div className="demo-banner admin-view-banner" role="status">
        <Icon name="eye" />
        <span className="top-strip-text">
          <strong className="top-strip-tag">Admin-Ansicht</strong> – nur lesen · <strong>{family.name}</strong>
          {art ? ` (${art})` : ''}
        </span>
        <Link to="/admin" className="top-strip-link">
          Zurück zum Admin
        </Link>
        <button type="button" className="top-strip-link" onClick={onEnd}>
          Beenden
        </button>
      </div>
    </TopStripSlot>
  )
}

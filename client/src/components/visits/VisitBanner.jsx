import { useNavigate } from 'react-router-dom'
import { HOME_LABEL, START_ROUTE } from '../../lib/areas.js'
import Icon from '../Icon.jsx'
import { TopStripSlot } from '../TopStrip.jsx'

// Hinweis über jeder Seite, solange die Sitzung zu Besuch in einem anderen Zuhause ist (Phase V2, me.zuBesuch) - seit der
// Calm-down-Runde eine schmale Zeile in der Leiste oben (TopStrip): wo man ist, was hier geht (ansehen, kommentieren)
// und der Weg zurück nach „Mein Zuhause“. Am Handy nur „Zu Besuch bei …“ und „Zurück“.
// Phase W: "Zurück" führt nur nach /start - dort wechselt das AreaGate ins eigene Zuhause (genau ein api.view).
export default function VisitBanner({ family }) {
  const navigate = useNavigate()

  function handleBack() {
    navigate(START_ROUTE)
  }

  return (
    <TopStripSlot>
      <div className="visit-banner" role="status">
        <Icon name="home" />
        <span className="top-strip-text">
          Zu Besuch bei <strong>{family.name}</strong>
          <span className="top-strip-long"> · du kannst ansehen und kommentieren, aber nichts ändern</span>
        </span>
        <button type="button" className="top-strip-link visit-banner-back" aria-label={`Zurück zu ${HOME_LABEL}`} onClick={handleBack}>
          Zurück<span className="top-strip-long"> zu {HOME_LABEL}</span>
        </button>
      </div>
    </TopStripSlot>
  )
}

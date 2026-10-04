import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { HOME_LABEL, startRoute } from '../../lib/areas.js'
import { useToast } from '../Toast.jsx'
import Icon from '../Icon.jsx'
import { TopStripSlot } from '../TopStrip.jsx'

// Hinweis über jeder Seite, solange die Sitzung zu Besuch in einem anderen Zuhause ist (Phase V2, me.zuBesuch) - seit der
// Calm-down-Runde eine schmale Zeile in der Leiste oben (TopStrip): wo man ist, was hier geht (ansehen, kommentieren)
// und der Weg zurück nach „Mein Zuhause“. Am Handy nur „Zu Besuch bei …“ und „Zurück“.
export default function VisitBanner({ family, onFamilyChange }) {
  const navigate = useNavigate()
  const toast = useToast()

  async function handleBack() {
    try {
      const me = await api.view(family.home.id)
      onFamilyChange(me)
      navigate(startRoute(me))
    } catch (err) {
      toast(err.message)
    }
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

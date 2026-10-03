import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { startRoute } from '../../lib/areas.js'
import { useToast } from '../Toast.jsx'

// Band über jeder Seite, solange die Sitzung zu Besuch in einem anderen Zuhause ist (Phase V2, me.zuBesuch):
// was hier geht (ansehen, kommentieren) und der Weg zurück in die eigene Chronik.
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
    <div className="visit-banner" role="status">
      <p>
        Zu Besuch bei <strong>{family.name}</strong> – du kannst ansehen und kommentieren, aber nichts ändern.
      </p>
      <button type="button" className="btn btn-ghost visit-banner-back" onClick={handleBack}>
        Zurück zu Meiner Chronik
      </button>
    </div>
  )
}

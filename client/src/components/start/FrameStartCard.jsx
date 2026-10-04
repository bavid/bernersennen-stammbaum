import { Link } from 'react-router-dom'
import '../../styles/bilderrahmen-start.css'
import Icon from '../Icon.jsx'

// Kleine Karte am Rand von Start (nur, wenn es Fotos gibt): „Als Bilderrahmen zeigen“ - mit einem eurer Fotos als kleinem
// Polaroid. Der Rahmen für ein anderes Gerät steht in den Einstellungen unter „Mein Zuhause“.
export default function FrameStartCard({ photo }) {
  return (
    <section className="card start-card start-frame" aria-labelledby="start-frame-title">
      <h2 id="start-frame-title" className="start-card-title">
        Bilderrahmen
      </h2>
      <div className="start-frame-body">
        <span className="start-frame-polaroid" aria-hidden="true">
          <img src={photo} alt="" loading="lazy" width={64} height={64} />
        </span>
        <p className="muted">Eure Tierfotos als ruhige Diashow – für das Tablet im Regal oder den Fernseher.</p>
      </div>
      <Link to="/bilderrahmen" className="start-card-link">
        Als Bilderrahmen zeigen
        <Icon name="chevronRight" />
      </Link>
    </section>
  )
}

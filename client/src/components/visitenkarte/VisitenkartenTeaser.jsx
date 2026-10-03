import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'

// Einstieg in den Karten-Designer (Phase V5) im Profil-Reiter "Teilen" - der Designer hat keinen eigenen
// Navigationspunkt (die Leiste ist voll). Die kleine Skizze zeigt Vorder- und Rückseite übereinander. Zwei Wege: die
// Visitenkarten und die Einladungskarten (?art=einladung - vorne ihr, hinten Familie auf Pfoten mit Code).

export const VISITENKARTEN_ROUTE = '/visitenkarten'
export const EINLADUNGSKARTEN_ROUTE = '/visitenkarten?art=einladung'

export default function VisitenkartenTeaser() {
  return (
    <section className="card vk-teaser" aria-labelledby="vk-teaser-title">
      <span className="vk-teaser-art" aria-hidden="true">
        <span className="vk-teaser-back" />
        <span className="vk-teaser-front" />
      </span>
      <div className="vk-teaser-text">
        <h2 id="vk-teaser-title">Visitenkarten</h2>
        <p className="muted">
          Eure Karte mit QR-Code zum Portal – zum Selberdrucken, auf Wunsch mit einem Kunden-Gutschein. Oder Einladungskarten: hinten
          Familie auf Pfoten mit einem eigenen Code für eure Kundschaft.
        </p>
      </div>
      <div className="vk-teaser-actions">
        <Link to={VISITENKARTEN_ROUTE} className="btn btn-primary">
          <Icon name="printer" /> Visitenkarten gestalten
        </Link>
        <Link to={EINLADUNGSKARTEN_ROUTE} className="btn btn-ghost">
          <Icon name="printer" /> Einladungskarten gestalten
        </Link>
      </div>
    </section>
  )
}

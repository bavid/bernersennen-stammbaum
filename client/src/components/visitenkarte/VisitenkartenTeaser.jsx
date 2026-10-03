import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'

// Einstieg in den Visitenkarten-Designer (Phase V5) im Profil-Reiter "Teilen" - der Designer hat keinen eigenen
// Navigationspunkt (die Leiste ist voll). Die kleine Skizze zeigt Vorder- und Rückseite übereinander.

export const VISITENKARTEN_ROUTE = '/visitenkarten'

export default function VisitenkartenTeaser() {
  return (
    <section className="card vk-teaser" aria-labelledby="vk-teaser-title">
      <span className="vk-teaser-art" aria-hidden="true">
        <span className="vk-teaser-back" />
        <span className="vk-teaser-front" />
      </span>
      <div className="vk-teaser-text">
        <h2 id="vk-teaser-title">Visitenkarten</h2>
        <p className="muted">Eure Karte mit QR-Code zum Portal – zum Selberdrucken, auf Wunsch mit einem Kunden-Gutschein auf jeder Karte.</p>
      </div>
      <Link to={VISITENKARTEN_ROUTE} className="btn btn-primary">
        <Icon name="printer" /> Visitenkarten gestalten
      </Link>
    </section>
  )
}

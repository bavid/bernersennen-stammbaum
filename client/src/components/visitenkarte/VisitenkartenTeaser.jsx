import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'
import { KARTE, karteRoute } from '../../lib/kartenWahl.js'
import { t } from '../../lib/i18n/index.js'
import { Button } from '../ui/index.js'

// Einstieg in den Karten-Designer (Phase V5) im Profil-Reiter "Teilen" - der Designer hat keinen eigenen
// Navigationspunkt (die Leiste ist voll). Die kleine Skizze zeigt Vorder- und Rückseite übereinander. Feedback-Runde: ein
// Weg für alle Kombinationen - ohne Vorwahl öffnet der Designer die gespeicherte, sonst die Kombi (Portal und
// Einladungscode); die Einladungscodes verlinken direkt die Einladungskarte (EINLADUNGSKARTEN_ROUTE).

export const VISITENKARTEN_ROUTE = karteRoute()
export const EINLADUNGSKARTEN_ROUTE = karteRoute(KARTE.einladung)

export default function VisitenkartenTeaser() {
  return (
    <section className="card vk-teaser" aria-labelledby="vk-teaser-title">
      <span className="vk-teaser-art" aria-hidden="true">
        <span className="vk-teaser-back" />
        <span className="vk-teaser-front" />
      </span>
      <div className="vk-teaser-text">
        <h2 id="vk-teaser-title">{t('Visitenkarten & Einladungskarten')}</h2>
        <p className="muted">
          {t('Zum Selberdrucken: vorne eure Kontakte, hinten euer Portal, ein Einladungscode für eure Kundschaft – oder beides.')}
        </p>
      </div>
      <div className="vk-teaser-actions">
        <Button to={VISITENKARTEN_ROUTE} as={Link}>
          <Icon name="printer" /> {t('Karten gestalten')}
        </Button>
      </div>
    </section>
  )
}

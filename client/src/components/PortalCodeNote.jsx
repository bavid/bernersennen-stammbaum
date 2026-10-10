import Icon from './Icon.jsx'
import { InternalLink } from './PreviewLink.jsx'
import { SECTION_IDS } from '../lib/portalTabs.js'
import { t } from '../lib/i18n/index.js'

// Wohin "Code einlösen" führt: das Einlösen auf der Startseite (App.jsx /v, LoginPage im Einlöse-Modus) - der Partner
// steckt bereits im Code, das Portal braucht dafür kein eigenes Formular.
export const REDEEM_PATH = '/v'

const TITLE_ID = `${SECTION_IDS.gutschein}-title`

// Feedback-Runde: der Einladungscode gehört der Plattform, nicht dem Partner - deshalb nur eine kleine, leise Karte am
// Ende des Reiters "Kontakt" (nach dem Kontakt des Partners): eine Zeile, ein Satz, ein Text-Link. Bewusst ohne
// Überschrift (h2/h3) und ohne großen Knopf. Die id bleibt das alte Sprungziel (#gutschein, lib/portalTabs.js); der Titel
// ist per Skript fokussierbar wie die Überschriften der Abschnitte. Nur für Besucher ohne Sitzung (PortalBody) - wer
// angemeldet ist, hat seine Chronik schon. In der Kundensicht ist der Link deaktiviert (InternalLink).
export default function PortalCodeNote() {
  return (
    <aside id={SECTION_IDS.gutschein} className="portal-code-note" aria-labelledby={TITLE_ID}>
      <div className="portal-code-note-text">
        <p id={TITLE_ID} className="portal-code-note-title" tabIndex={-1}>
          {t('Einladungscode bekommen?')}
        </p>
        <p>{t('Damit legt ihr kostenlos eure eigene Tier-Chronik an.')}</p>
      </div>
      <InternalLink to={REDEEM_PATH} className="portal-code-note-link">
        {t('Code einlösen')}
        <Icon name="arrowRight" />
      </InternalLink>
    </aside>
  )
}

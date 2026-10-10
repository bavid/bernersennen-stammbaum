import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'
import { Card, Chip } from '../ui/index.js'
import { NETZ_ANFRAGE, NETZ_BOERSE, NETZ_GUTSCHEIN, NETZWERK_DEMO_KEYS } from '../../lib/netzwerk.js'
import { PRESENT_TILES, demoStartUrl } from '../../lib/present.js'
import { t } from '../../lib/i18n/index.js'

// Statische Entwürfe für /netzwerk (pages/NetzwerkPage.jsx, Daten in lib/netzwerk.js). Nichts davon ist echt:
// die „Knöpfe“ sind nur Bilder (span, nicht anklickbar), jeder Entwurf trägt das Etikett „Entwurf“. Stil: styles/netzwerk.css.

const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' }

function Entwurf({ label, children }) {
  return (
    <figure className="netz-entwurf" aria-label={t(label)}>
      <figcaption className="netz-entwurf-label">
        <Icon name="edit" aria-hidden="true" /> {t('Entwurf – so könnte es aussehen')}
      </figcaption>
      {children}
    </figure>
  )
}

function FakeButton({ variant = 'primary', children }) {
  return (
    <span className={`btn btn-${variant} btn-compact netz-fake-btn`} aria-hidden="true">
      {children}
    </span>
  )
}

function AnfrageEntwurf() {
  const a = NETZ_ANFRAGE
  return (
    <Entwurf label="Beispiel: Anfrage an eine Hundeschule">
      <Card variant="flat" className="netz-karte">
        <div className="netz-karte-kopf">
          <Chip tone="neu" icon="send">{t('Neue Anfrage')}</Chip>
          <span className="muted">{t('{von} an {an}', { von: a.von, an: a.an })}</span>
        </div>
        <strong className="netz-karte-titel">{t('Trainingsplatz für {tier}', { tier: a.tier })}</strong>
        <p className="netz-karte-text">{t(a.text)}</p>
        <div className="netz-karte-termine">
          <span className="muted">{t('Vorschlag der Hundeschule:')}</span>
          {a.termine.map((termin) => (
            <Chip key={termin} tone="ok" icon="calendar">{t(termin)}</Chip>
          ))}
        </div>
        <div className="netz-karte-aktionen">
          <FakeButton>{t('Termin zusagen')}</FakeButton>
          <FakeButton variant="ghost">{t('Nachricht schreiben')}</FakeButton>
        </div>
      </Card>
    </Entwurf>
  )
}

function BoerseEntwurf() {
  return (
    <Entwurf label="Beispiel: Notfallplatz-Börse">
      <ul className="netz-liste">
        {NETZ_BOERSE.map((eintrag) => (
          <Card as="li" variant="flat" pad="sm" key={eintrag.id} className="netz-liste-eintrag">
            <span className="netz-liste-text">
              <strong>{t(eintrag.was)}</strong>
              <span className="muted">{t('{wer} · {wann}', { wer: eintrag.wer, wann: t(eintrag.wann) })}</span>
            </span>
            <Chip tone={eintrag.tone}>{t(eintrag.status)}</Chip>
          </Card>
        ))}
      </ul>
    </Entwurf>
  )
}

function GutscheinEntwurf() {
  const g = NETZ_GUTSCHEIN
  return (
    <Entwurf label="Beispiel: gesponserter Gutschein">
      <Card variant="tinted" className="netz-karte netz-gutschein">
        <span className="eyebrow">{t('Willkommen im neuen Zuhause')}</span>
        <strong className="netz-karte-titel">{t(g.angebot)}</strong>
        <p className="netz-karte-text">
          {t('Geschenkt von {sponsor} für Familien aus dem {fuer}.', { sponsor: g.sponsor, fuer: g.fuer })}
        </p>
        <div className="netz-karte-kopf">
          <Chip tone="anzeige" icon="star">{t('Partner-Angebot')}</Chip>
          <span className="muted">{t('{eingeloest} von {anzahl} Karten eingelöst', { eingeloest: g.eingeloest, anzahl: g.anzahl })}</span>
        </div>
      </Card>
    </Entwurf>
  )
}

function MitmachenFolie() {
  const tiles = PRESENT_TILES.filter((tile) => NETZWERK_DEMO_KEYS.includes(tile.key))
  return (
    <>
      <Link to="/partner-werden" className="btn btn-primary btn-lg vorstellung-cta">
        <Icon name="users" /> {t('Partner werden')}
      </Link>
      <ul className="vorstellung-tiles">
        {tiles.map((tile) => (
          <li key={tile.key}>
            <a className="present-tile" href={demoStartUrl(tile)} {...NEW_TAB} data-key={tile.key}>
              <Icon name={tile.icon} />
              <span className="present-tile-title">{t(tile.label)}</span>
              <span className="present-tile-sub">{t(tile.description)}</span>
              <span className="present-tile-hint muted">
                {t('Öffnet in neuem Tab')} <Icon name="external" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}

export const NETZWERK_ZUSATZ = Object.freeze({
  anfrage: AnfrageEntwurf,
  boerse: BoerseEntwurf,
  gutschein: GutscheinEntwurf,
  mitmachen: MitmachenFolie
})

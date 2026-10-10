import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'
import FinanzierungRegel from '../components/finanzierung/FinanzierungRegel.jsx'
import { hatFinanzDaten } from '../lib/finanzierungRuecklage.js'
import { PRESENT_TILES, demoStartUrl } from '../lib/present.js'
import { FOLIEN } from '../lib/vorstellung.js'
import { FolienDots, FolienNav, useFolie } from '../components/folien/FolienSteuerung.jsx'
import '../styles/vorstellung.css'
import { t } from '../lib/i18n/index.js'

// /vorstellung - Präsentation zum Durchklicken (lib/vorstellung.js): öffentlich wie /app (App.jsx), mit oder ohne
// Sitzung. Eine Folie pro Bildschirm; Weiter/Zurück, Pfeiltasten, Punkte und ?folie=N (1-basiert, wird begrenzt).
// Die Folie steht in einer aria-live-Region; Bewegung nur ohne „weniger Bewegung“ (styles/vorstellung.css).

const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' }

function Punkte({ folie }) {
  return (
    <ul className="vorstellung-points">
      {folie.points.map((point) => (
        <li key={point.title}>
          <span className="vorstellung-point-icon" aria-hidden="true">
            <Icon name={point.icon} />
          </span>
          <span>
            <strong>{t(point.title)}</strong>
            <span className="vorstellung-point-text">{t(point.text)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

// Rücklage-Zahlen kommen wie auf /finanzierung aus GET /api/finanzierung; ohne Zahlen (oder bei Fehler) steht nur die Regel.
function FinanzFolie() {
  const [data, setData] = useState(null)
  useEffect(() => {
    let cancelled = false
    api
      .finanzierung()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return (
    <>
      <FinanzierungRegel ruecklage={hatFinanzDaten(data) ? data.ruecklage : null} />
      <Link to="/finanzierung" className="vorstellung-more">
        {t('Alle Zahlen ansehen')} <Icon name="arrowRight" />
      </Link>
    </>
  )
}

function AppFolie() {
  return (
    <Link to="/app" className="btn btn-primary btn-lg vorstellung-cta">
      <Icon name="phone" /> {t('So kommt die App aufs Handy')}
    </Link>
  )
}

function DemoFolie() {
  return (
    <ul className="vorstellung-tiles">
      {PRESENT_TILES.map((tile) => (
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
  )
}

const FOLIEN_ZUSATZ = { finanz: FinanzFolie, app: AppFolie, demo: DemoFolie }

function Folie({ folie }) {
  const Zusatz = FOLIEN_ZUSATZ[folie.kind]
  return (
    <article className="vorstellung-folie" aria-labelledby="vorstellung-titel">
      <span className="eyebrow">{t(folie.eyebrow)}</span>
      <h1 id="vorstellung-titel">{t(folie.title)}</h1>
      {folie.lead && <p className="vorstellung-lead">{t(folie.lead)}</p>}
      {folie.points.length > 0 && <Punkte folie={folie} />}
      {Zusatz && <Zusatz />}
    </article>
  )
}

export default function VorstellungPage({ family = null }) {
  const { aktuell, gehZu } = useFolie(FOLIEN.length)
  const folie = FOLIEN[aktuell - 1]

  return (
    <div className="public-page vorstellung-page">
      <PublicHeader family={family} homeLink />
      <main className="vorstellung-main">
        <div key={folie.id} className="vorstellung-live" aria-live="polite">
          <Folie folie={folie} />
        </div>
        <FolienNav aktuell={aktuell} anzahl={FOLIEN.length} gehZu={gehZu} />
        <FolienDots folien={FOLIEN} aktuell={aktuell} onSelect={gehZu} />
      </main>
      <PublicFooter />
    </div>
  )
}

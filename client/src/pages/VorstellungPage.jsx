import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'
import FinanzierungRegel from '../components/finanzierung/FinanzierungRegel.jsx'
import { hatFinanzDaten } from '../lib/finanzierungRuecklage.js'
import { PRESENT_TILES, demoStartUrl } from '../lib/present.js'
import { FOLIEN, FOLIE_PARAM, clampFolie } from '../lib/vorstellung.js'
import '../styles/vorstellung.css'
import { t } from '../lib/i18n/index.js'

// /vorstellung - Präsentation zum Durchklicken (lib/vorstellung.js): öffentlich wie /app (App.jsx), mit oder ohne
// Sitzung. Eine Folie pro Bildschirm; Weiter/Zurück, Pfeiltasten, Punkte und ?folie=N (1-basiert, wird begrenzt).
// Die Folie steht in einer aria-live-Region; Bewegung nur ohne „weniger Bewegung“ (styles/vorstellung.css).

const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' }
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

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

function Dots({ aktuell, onSelect }) {
  return (
    <ul className="vorstellung-dots" aria-label={t('Folien')}>
      {FOLIEN.map((folie, index) => (
        <li key={folie.id}>
          <button
            type="button"
            aria-label={t('Folie {n}: {titel}', { n: index + 1, titel: t(folie.eyebrow) })}
            aria-current={index + 1 === aktuell ? 'step' : undefined}
            onClick={() => onSelect(index + 1)}
          />
        </li>
      ))}
    </ul>
  )
}

function useFolie() {
  const [params, setParams] = useSearchParams()
  const aktuell = clampFolie(params.get(FOLIE_PARAM))
  const gehZu = useCallback(
    (nummer) => setParams({ [FOLIE_PARAM]: String(clampFolie(nummer)) }, { replace: true }),
    [setParams]
  )

  useEffect(() => {
    function onKey(event) {
      if (event.altKey || event.ctrlKey || event.metaKey || TYPING_TAGS.has(event.target?.tagName)) return
      if (event.key === 'ArrowRight') gehZu(aktuell + 1)
      if (event.key === 'ArrowLeft') gehZu(aktuell - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aktuell, gehZu])

  return { aktuell, gehZu }
}

export default function VorstellungPage({ family = null }) {
  const { aktuell, gehZu } = useFolie()
  const folie = FOLIEN[aktuell - 1]
  const istErste = aktuell === 1
  const istLetzte = aktuell === FOLIEN.length

  return (
    <div className="public-page vorstellung-page">
      <PublicHeader family={family} />
      <main className="vorstellung-main">
        <div key={folie.id} className="vorstellung-live" aria-live="polite">
          <Folie folie={folie} />
        </div>
        <nav className="vorstellung-nav" aria-label={t('Folien durchklicken')}>
          <button type="button" className="btn btn-ghost" disabled={istErste} onClick={() => gehZu(aktuell - 1)}>
            <Icon name="arrowLeft" /> {t('Zurück')}
          </button>
          <span className="vorstellung-count muted">
            {t('Folie {n} von {total}', { n: aktuell, total: FOLIEN.length })}
          </span>
          {istLetzte ? (
            <Link to="/" className="btn btn-primary">
              {t('Zur Startseite')} <Icon name="arrowRight" />
            </Link>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => gehZu(aktuell + 1)}>
              {t('Weiter')} <Icon name="arrowRight" />
            </button>
          )}
        </nav>
        <Dots aktuell={aktuell} onSelect={gehZu} />
      </main>
      <PublicFooter />
    </div>
  )
}

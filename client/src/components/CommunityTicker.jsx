import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Icon from './Icon.jsx'
import useMediaQuery from '../hooks/useMediaQuery.js'
import { STATIC_COUNT, TICKER_LEER, tickerDuration, tickerItems, tickerSentence } from '../lib/community.js'
import '../styles/community-ticker.css'

// Laufband „Zahlen aus der Gemeinschaft“ auf der Startseite (unten über dem Fuß) und den öffentlichen Seiten /finanzierung
// und /partner-werden (nur ohne Sitzung): eine Zeile, die von rechts nach links läuft - „Dabei sind 10 Familien · 200
// Erinnerungen · …“ aus GET /api/community (lib/community.js). Barrierearm:
// - Bewegung: doppelter Inhalt für eine nahtlose Schleife (CSS translateX), hält bei Hover und Fokus an; der Knopf
//   „Laufband anhalten“ stoppt sie ganz und zeigt alles ruhig (dann sind auch die Partner-Links per Tastatur erreichbar).
// - prefers-reduced-motion: gar keine Bewegung - eine ruhige Zeile mit den ersten Einträgen und „mehr“.
// - Screenreader: das laufende Band ist aria-hidden, stattdessen steht der Satz einmal unsichtbar da (keine Live-Region).
// Ohne Antwort oder mit Fehler erscheint nichts; sind alle Zahlen 0, zeigt nur die Startseite (fallback) „Gerade starten wir“.

function useCommunity() {
  const [data, setData] = useState(undefined)
  useEffect(() => {
    let cancelled = false
    // Über Promise.resolve: auch ein synchroner Fehler blendet das Band nur aus - es ist nie wichtiger als die Seite.
    Promise.resolve()
      .then(() => api.community())
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return data
}

function ItemContent({ item, focusable }) {
  if (!item.href) return item.text
  return (
    <Link to={item.href} tabIndex={focusable ? undefined : -1}>
      {item.text}
    </Link>
  )
}

function StaticList({ items, reduced }) {
  const [expanded, setExpanded] = useState(false)
  const canExpand = reduced && items.length > STATIC_COUNT
  const visible = canExpand && !expanded ? items.slice(0, STATIC_COUNT) : items
  return (
    <>
      <ul className="community-ticker-static" id="community-ticker-list">
        {visible.map((item) => (
          <li key={item.key}>
            <ItemContent item={item} focusable />
          </li>
        ))}
      </ul>
      {canExpand && (
        <button type="button" className="community-ticker-more" aria-expanded={expanded} aria-controls="community-ticker-list" onClick={() => setExpanded((open) => !open)}>
          {expanded ? 'weniger' : 'mehr'}
        </button>
      )}
    </>
  )
}

function Marquee({ items }) {
  return (
    <>
      <p className="visually-hidden">{tickerSentence(items)}</p>
      <div className="community-ticker-viewport" aria-hidden="true">
        <div className="community-ticker-track" style={{ '--ticker-duration': `${tickerDuration(items)}s` }}>
          {[0, 1].map((copy) => (
            <ul key={copy} className="community-ticker-list">
              {items.map((item) => (
                <li key={item.key}>
                  <ItemContent item={item} focusable={false} />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </>
  )
}

export default function CommunityTicker({ fallback = false, className = '' }) {
  const data = useCommunity()
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [paused, setPaused] = useState(false)
  if (!data) return null
  const items = tickerItems(data)
  if (!items.length && !fallback) return null
  const moving = items.length > 0 && !reduced && !paused

  return (
    <div role="region" aria-label="Zahlen aus der Gemeinschaft" className={`community-ticker ${moving ? 'is-moving' : 'is-static'} ${className}`.trim()}>
      <Icon name="paw" />
      {items.length === 0 && <p className="community-ticker-empty">{TICKER_LEER}</p>}
      {moving && <Marquee items={items} />}
      {items.length > 0 && !moving && <StaticList items={items} reduced={reduced} />}
      {items.length > 0 && !reduced && (
        <button
          type="button"
          className="community-ticker-toggle"
          aria-label={paused ? 'Laufband abspielen' : 'Laufband anhalten'}
          title={paused ? 'Laufband abspielen' : 'Laufband anhalten'}
          onClick={() => setPaused((value) => !value)}
        >
          <Icon name={paused ? 'play' : 'pause'} />
        </button>
      )}
    </div>
  )
}

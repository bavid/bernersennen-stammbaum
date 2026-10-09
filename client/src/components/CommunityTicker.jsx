import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Icon from './Icon.jsx'
import useMediaQuery from '../hooks/useMediaQuery.js'
import { STATIC_COUNT, tickerDuration, tickerItems, tickerLeer, tickerSentence } from '../lib/community.js'
import { t } from '../lib/i18n/index.js'
import '../styles/community-ticker.css'

// Band „Mit dabei“ auf der Startseite (unten über dem Fuß) und den öffentlichen Seiten /finanzierung und /partner-werden:
// kleine Karten mit Zahl und Wort („48 Erinnerungen“) und dem vorgestellten Partner, aus GET /api/community
// (lib/community.js). Es läuft nur, wenn die Karten nicht in eine Zeile passen - sonst stehen sie ruhig nebeneinander
// (vorher lief auch eine kurze Reihe und zeigte sich doppelt). Barrierearm:
// - Bewegung: doppelter Inhalt für eine nahtlose Schleife (CSS translateX), hält bei Hover und Fokus an; der Knopf
//   „Laufband anhalten“ stoppt sie ganz und zeigt alles ruhig (dann sind auch die Partner-Links per Tastatur erreichbar).
// - prefers-reduced-motion: gar keine Bewegung - die ersten Einträge und „mehr“.
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

// Passt die Reihe in die Breite? Gemessen an einer unsichtbaren Kopie (measureRef) gegen den freien Platz (spaceRef).
// Ohne Messmöglichkeit (jsdom, alter Browser) gilt sie als zu breit - dann läuft das Band wie bisher.
function useOverflow(spaceRef, measureRef, deps) {
  const [overflowing, setOverflowing] = useState(true)
  useLayoutEffect(() => {
    const space = spaceRef.current
    const measure = measureRef.current
    if (!space || !measure || typeof ResizeObserver === 'undefined') return undefined
    const check = () => {
      if (!space.clientWidth) return
      setOverflowing(measure.scrollWidth > space.clientWidth)
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(space)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return overflowing
}

function Chip({ item, focusable }) {
  if (item.featured) {
    return (
      <Link to={item.href} className="community-chip is-featured" tabIndex={focusable ? undefined : -1}>
        <span className="community-chip-icon" aria-hidden="true">
          <Icon name={item.icon} />
        </span>
        <span className="community-chip-kicker">{item.kicker}</span>
        <strong className="community-chip-name">{item.label}</strong>
        <Icon name="arrowRight" />
      </Link>
    )
  }
  return (
    <span className="community-chip">
      <span className="community-chip-icon" aria-hidden="true">
        <Icon name={item.icon} />
      </span>
      <strong className="community-chip-value">{item.value}</strong>
      <span className="community-chip-label">{item.label}</span>
    </span>
  )
}

function ChipList({ items, className, focusable, id, hidden }) {
  return (
    <ul className={className} id={id} aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <li key={item.key}>
          <Chip item={item} focusable={focusable} />
        </li>
      ))}
    </ul>
  )
}

function StaticList({ items, reduced }) {
  const [expanded, setExpanded] = useState(false)
  const canExpand = reduced && items.length > STATIC_COUNT
  const visible = canExpand && !expanded ? items.slice(0, STATIC_COUNT) : items
  return (
    <div className="community-ticker-static-wrap">
      <ChipList items={visible} className="community-ticker-static" id="community-ticker-list" focusable />
      {canExpand && (
        <button type="button" className="community-ticker-more" aria-expanded={expanded} aria-controls="community-ticker-list" onClick={() => setExpanded((open) => !open)}>
          {expanded ? t('weniger') : t('mehr')}
        </button>
      )}
    </div>
  )
}

function Marquee({ items }) {
  return (
    <>
      <p className="visually-hidden">{tickerSentence(items)}</p>
      <div className="community-ticker-viewport" aria-hidden="true">
        <div className="community-ticker-track" style={{ '--ticker-duration': `${tickerDuration(items)}s` }}>
          {[0, 1].map((copy) => (
            <ChipList key={copy} items={items} className="community-ticker-list" focusable={false} />
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
  const spaceRef = useRef(null)
  const measureRef = useRef(null)
  const items = data ? tickerItems(data) : []
  const overflowing = useOverflow(spaceRef, measureRef, [data, items.length])
  if (!data) return null
  if (!items.length && !fallback) return null
  const canMove = items.length > 0 && !reduced && overflowing
  const moving = canMove && !paused

  return (
    <div role="region" aria-label={t('Zahlen aus der Gemeinschaft')} className={`community-ticker ${moving ? 'is-moving' : 'is-static'} ${className}`.trim()}>
      <p className="community-ticker-title" aria-hidden="true">
        <Icon name="paw" />
        <span>{t('Mit dabei')}</span>
      </p>
      <div className="community-ticker-space" ref={spaceRef}>
        {items.length > 0 && <ChipList items={items} className="community-ticker-measure" focusable={false} hidden />}
        {items.length === 0 && <p className="community-ticker-empty">{tickerLeer()}</p>}
        {moving && <Marquee items={items} />}
        {items.length > 0 && !moving && <StaticList items={items} reduced={reduced} />}
      </div>
      {canMove && (
        <button
          type="button"
          className="community-ticker-toggle"
          aria-label={paused ? t('Laufband abspielen') : t('Laufband anhalten')}
          title={paused ? t('Laufband abspielen') : t('Laufband anhalten')}
          onClick={() => setPaused((value) => !value)}
        >
          <Icon name={paused ? 'play' : 'pause'} />
        </button>
      )}
    </div>
  )
}

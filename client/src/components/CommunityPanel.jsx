import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { HeroPhotos } from './CommunityTicker.jsx'
import useMediaQuery from '../hooks/useMediaQuery.js'
import { tickerHero, tickerItems, tickerLeer } from '../lib/community.js'
import { t } from '../lib/i18n/index.js'
import '../styles/community-panel.css'

// „Mit dabei“ als ruhige Karte im Album-Look (statt des Bands): oben der Partner des Monats mit größerem Foto (blendet
// wie im Band durch seine Fotos, bei weniger Bewegung nur das erste), darunter die Zahlen als Liste (Symbol, Zahl, Wort),
// der eigene Eintrag des Admins und weitere vorgestellte Partner als Link-Zeilen. Kein Laufband. Daten und Auswahl wie im
// Band (lib/community.js: tickerHero, tickerItems). layout „column“: schmale Seitenkarte links neben der Begrüßung (breite
// Bildschirme); „row“: quer - Foto links, Zahlen rechts - unter den drei Stichworten (mittlere Breiten).

function PanelHero({ hero, reduced }) {
  return (
    <Link to={hero.href} className="community-panel-hero">
      <span className="community-panel-photo">
        {hero.fotos.length > 0 ? <HeroPhotos fotos={hero.fotos} name={hero.name} reduced={reduced} width={320} height={240} /> : <Icon name="star" />}
      </span>
      <span className="community-panel-hero-text">
        <span className="community-panel-kicker">{hero.kicker}</span>
        <strong className="community-panel-name">
          <span>{hero.name}</span>
          <Icon name="arrowRight" />
        </strong>
      </span>
    </Link>
  )
}

function PanelLine({ item }) {
  const text = item.featured ? (
    <>
      <span className="community-panel-line-kicker">{item.kicker}</span> {item.label}
    </>
  ) : (
    item.label
  )
  const inner = (
    <>
      <span className="community-panel-icon" aria-hidden="true">
        <Icon name={item.icon} />
      </span>
      <span className="community-panel-line-text">{text}</span>
    </>
  )
  return item.href ? (
    <Link to={item.href} className="community-panel-line">
      {inner}
    </Link>
  ) : (
    <span className="community-panel-line">{inner}</span>
  )
}

function PanelStats({ stats }) {
  return (
    <ul className="community-panel-stats">
      {stats.map((item) => (
        <li key={item.key}>
          <span className="community-panel-icon" aria-hidden="true">
            <Icon name={item.icon} />
          </span>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

export default function CommunityPanel({ data, fallback = false, layout = 'column', className = '' }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  if (!data) return null
  const items = tickerItems(data)
  const hero = tickerHero(data)
  if (!items.length && !hero && !fallback) return null
  const stats = items.filter((item) => !item.hinweis && !item.featured)
  const lines = items.filter((item) => item.hinweis || item.featured)
  return (
    <div role="region" aria-label={t('Zahlen aus der Gemeinschaft')} className={`community-panel is-${layout} ${className}`.trim()}>
      <p className="community-panel-title">
        <Icon name="paw" />
        <span>{t('Mit dabei')}</span>
      </p>
      {hero && <PanelHero hero={hero} reduced={reduced} />}
      <div className="community-panel-body">
        {stats.length > 0 && <PanelStats stats={stats} />}
        {lines.map((item) => (
          <PanelLine key={item.key} item={item} />
        ))}
        {!items.length && !hero && <p className="community-panel-empty">{tickerLeer()}</p>}
      </div>
    </div>
  )
}

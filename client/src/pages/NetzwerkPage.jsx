import PublicHeader from '../components/PublicHeader.jsx'
import PublicFooter from '../components/PublicFooter.jsx'
import Icon from '../components/Icon.jsx'
import { FolienDots, FolienNav, useFolie } from '../components/folien/FolienSteuerung.jsx'
import { NETZWERK_ZUSATZ } from '../components/netzwerk/NetzwerkEntwuerfe.jsx'
import { NETZWERK_FOLIEN } from '../lib/netzwerk.js'
import '../styles/vorstellung.css'
import '../styles/netzwerk.css'
import { t } from '../lib/i18n/index.js'

// /netzwerk - „Phase B als Präsentationsseite“: wie Partner sich vernetzen könnten (lib/netzwerk.js). Öffentlich wie
// /vorstellung (App.jsx), gleiche Folien-Mechanik (Weiter/Zurück, Pfeiltasten, Punkte, ?folie=N). Kein Backend -
// alle Beispiele sind Entwürfe (components/netzwerk/NetzwerkEntwuerfe.jsx).

const FOLIEN = NETZWERK_FOLIEN
const ENDE = { to: '/partner-werden', label: 'Partner werden' }

function Folie({ folie }) {
  const Zusatz = NETZWERK_ZUSATZ[folie.kind]
  return (
    <article className="vorstellung-folie" aria-labelledby="vorstellung-titel">
      <span className="eyebrow">{t(folie.eyebrow)}</span>
      <h1 id="vorstellung-titel">{t(folie.title)}</h1>
      {folie.lead && <p className="vorstellung-lead">{t(folie.lead)}</p>}
      {folie.points.length > 0 && (
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
      )}
      {Zusatz && <Zusatz />}
    </article>
  )
}

export default function NetzwerkPage({ family = null }) {
  const { aktuell, gehZu } = useFolie(FOLIEN.length)
  const folie = FOLIEN[aktuell - 1]

  return (
    <div className="public-page vorstellung-page netzwerk-page">
      <PublicHeader family={family} />
      <main className="vorstellung-main">
        <div key={folie.id} className="vorstellung-live" aria-live="polite">
          <Folie folie={folie} />
        </div>
        <FolienNav aktuell={aktuell} anzahl={FOLIEN.length} gehZu={gehZu} ende={ENDE} />
        <FolienDots folien={FOLIEN} aktuell={aktuell} onSelect={gehZu} />
      </main>
      <PublicFooter />
    </div>
  )
}

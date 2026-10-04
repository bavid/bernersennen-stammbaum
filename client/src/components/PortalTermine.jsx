import { useState } from 'react'
import PortalSection from './PortalSection.jsx'
import TerminDate from './TerminDate.jsx'
import { SERIE, formatUhrzeit, groupByMonth, serieLabel, vorkommenKey } from '../lib/termine.js'
import { todayIso } from '../lib/dates.js'
import { SECTION_IDS, initialTermine, portalTermine } from '../lib/portalTabs.js'

// Text und Regel nur beim ersten stattfindenden Tag eines Termins - sonst stünden sie bei jeder Woche einer Serie erneut.
function firstKeys(items) {
  const seen = new Set()
  const keys = new Set()
  for (const item of items) {
    if (item.abgesagt || seen.has(item.terminId)) continue
    seen.add(item.terminId)
    keys.add(vorkommenKey(item))
  }
  return keys
}

function PortalTermin({ item, first }) {
  const meta = [item.ort, first && item.serie !== SERIE.keine ? serieLabel(item.serie, item.datum) : null].filter(Boolean).join(' · ')
  return (
    <li className={`termin-row portal-termin${item.abgesagt ? ' is-cancelled' : ''}`}>
      <TerminDate datum={item.datum} />
      <div className="termin-row-body">
        <p className="termin-row-time">
          {formatUhrzeit(item.uhrzeit, item.ende)}
          {item.abgesagt && <span className="termin-badge-cancelled">fällt aus</span>}
        </p>
        <h4 className="termin-row-title">{item.titel}</h4>
        {meta && <p className="termin-row-meta">{meta}</p>}
        {item.text && first && <p className="portal-termin-text">{item.text}</p>}
      </div>
    </li>
  )
}

// Reiter "Termine" auf dem Portal (Phase V4a): die kommenden Termine des Partners nach Monat - zuerst die nächsten drei Monate,
// "Mehr anzeigen" zeigt den Rest (der Server liefert bis zu zwölf Monate). Abgesagte stehen durchgestrichen mit
// "fällt aus" da; Text und Regel einer Serie stehen nur beim ersten Tag. Ohne Termine erscheint der Abschnitt nicht.
// today: nur für Tests, sonst heute.
export default function PortalTermine({ termine, today = todayIso() }) {
  const [showAll, setShowAll] = useState(false)
  const items = portalTermine(termine)
  if (items.length === 0) return null
  // Zuerst die nächsten drei Monate (findet darin nichts statt, gleich alle) - dasselbe Fenster zählt der Reiter
  // (lib/portalTabs.js upcomingTerminCount).
  const shown = showAll ? items : initialTermine(items, today)
  const hidden = items.length - shown.length
  const first = firstKeys(shown)

  return (
    <PortalSection id={SECTION_IDS.termine} title="Termine" className="partner-portal-termine">
      <div className="termin-overview">
        {groupByMonth(shown).map((group) => (
          <div key={group.key} className="termin-month">
            <h3 className="termin-month-title">{group.label}</h3>
            <ul className="termin-list">
              {group.items.map((item) => (
                <PortalTermin key={vorkommenKey(item)} item={item} first={first.has(vorkommenKey(item))} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {hidden > 0 && (
        <button type="button" className="btn btn-ghost portal-termine-more" onClick={() => setShowAll(true)}>
          Mehr anzeigen ({hidden} weitere)
        </button>
      )}
    </PortalSection>
  )
}

import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'
import { formatTermin, todayIso } from '../../lib/dates.js'
import { displayName } from '../../lib/timeline.js'
import AreaChip from '../feed/AreaChip.jsx'
import PinboardNotes from './PinboardNotes.jsx'
import { feedNoteLink } from '../../lib/startFeed.js'
import { baldText } from '../../lib/gesundheit.js'
import { t } from '../../lib/i18n/index.js'

// Wie weit vorher ein Einzugs-Jahrestag auf Start erscheint.
export const ANNIVERSARY_WINDOW_DAYS = 30

// "In 5 Tagen: Nele ist 5 Jahre bei euch" / "Heute: Nele ist 5 Jahre bei euch!"
export function anniversaryText(anniversary) {
  const name = displayName(anniversary.dog)
  const n = anniversary.years
  const years = n === 1 ? t('{n} Jahr', { n }) : t('{n} Jahre', { n })
  if (anniversary.daysUntil === 0) return t('Heute: {name} ist {years} bei euch!', { name, years })
  const d = anniversary.daysUntil
  const days = d === 1 ? t('{n} Tag', { n: d }) : t('{n} Tagen', { n: d })
  return t('In {days}: {name} ist {years} bei euch', { days, name, years })
}

// Tag (YYYY-MM-DD) in n Tagen ab heute - für den Jahrestag, der nur daysUntil kennt.
function plusDays(heute, n) {
  const date = new Date(`${heute}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + n)
  return date.toISOString().slice(0, 10)
}

// Alle Zeilen von „Bald“ in EINER Liste, nach Tag aufsteigend; am selben Tag bleibt die Reihenfolge (Termine, Gesundheit,
// Jahrestag) - Array.prototype.sort ist stabil.
export function soonItems({ termine = [], gesundheit = [], anniversary = null, heute = todayIso() }) {
  const items = [
    ...termine.map((termin) => ({ kind: 'termin', key: `termin-${termin.id}`, day: termin.termin_datum || '', data: termin })),
    ...gesundheit.map((item) => ({ kind: 'gesundheit', key: `gesundheit-${item.entryId}`, day: item.naechstesAm || '', data: item })),
    ...(anniversary ? [{ kind: 'jahrestag', key: 'jahrestag', day: plusDays(heute, anniversary.daysUntil), data: anniversary }] : [])
  ]
  return items.sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? -1 : 1))
}

function SoonRow({ item, heute }) {
  if (item.kind === 'termin') {
    const termin = item.data
    return (
      <li>
        <Icon name="calendar" />
        <Link to={feedNoteLink(termin)} className="start-soon-termin">
          <span className="start-soon-when">
            <strong>{formatTermin(termin.termin_datum, termin.termin_zeit, { short: true })}</strong>
            <AreaChip area={termin.area} />
          </span>
          <span className="start-soon-text">{termin.text}</span>
        </Link>
      </li>
    )
  }
  if (item.kind === 'gesundheit') {
    return (
      <li>
        <Icon name="clock" />
        <Link to={`/tier/${item.data.dogId}?reiter=infos`} className="start-soon-termin">
          <span className="start-soon-text">{baldText(item.data, heute)}</span>
        </Link>
      </li>
    )
  }
  return (
    <li>
      <Icon name="heart" />
      <span>{anniversaryText(item.data)}</span>
    </li>
  )
}

// "Bald" auf Start (Phase W): die nächsten Termine der Pinnwände - des Zuhauses und der Familien (Phase W, Schritt 3: aus
// GET /api/start, schon ohne vergangene, lib/startFeed.js upcomingTermine; mit dem Namen der Familie als kleinem Hinweis),
// je eine Zeile mit Link zu ihrer Pinnwand - und ein naher Einzugs-Jahrestag
// (lib/companions.js nextAnniversary), darunter „Neu an der Pinnwand“ (PinboardNotes, Schritt 3) und der Weg zu den
// Notizen, sobald es welche gibt (Entscheidung D2: die Pinnwand des Zuhauses hat keinen eigenen Menüpunkt) - alles von den
// Pinnwänden an einer Stelle. „Gesundheit leicht“: fällige Impfungen, Wurmkuren und Tierarzt-Termine der eigenen Tiere
// (gesundheit, GET /api/gesundheit/bald - heute bis 14 Tage) je als Zeile mit Link zum Reiter „Infos“ des Tiers. Alle Zeilen
// stehen nach Tag sortiert (soonItems). Ohne all das steht hier nichts; nur neue Zettel: der Kasten heißt „Neu an der Pinnwand“.
export default function StartSoon({ termine = [], anniversary, notes = [], notesCount = 0, gesundheit = [], heute = todayIso() }) {
  const showAnniversary = anniversary && anniversary.daysUntil <= ANNIVERSARY_WINDOW_DAYS
  const hasSoon = termine.length > 0 || gesundheit.length > 0 || Boolean(showAnniversary)
  if (!hasSoon && notes.length === 0 && notesCount === 0) return null
  return (
    <section className="card start-card start-soon" aria-labelledby="start-soon-title">
      <h2 id="start-soon-title" className="start-card-title">
        {hasSoon || notes.length === 0 ? t('Bald') : t('Neu an der Pinnwand')}
      </h2>
      {hasSoon && (
        <ul className="start-soon-list" role="list">
          {soonItems({ termine, gesundheit, anniversary: showAnniversary ? anniversary : null, heute }).map((item) => (
            <SoonRow key={item.key} item={item} heute={heute} />
          ))}
        </ul>
      )}
      <PinboardNotes notes={notes} heading={hasSoon} />
      {notesCount > 0 && (
        <Link to="/pinnwand" className="start-card-link">
          {t('Notizen')} ({notesCount}) <Icon name="arrowRight" />
        </Link>
      )}
    </section>
  )
}

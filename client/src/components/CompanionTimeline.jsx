import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import { displayName, speciesSexLabel } from '../lib/timeline.js'
import { herkunftText, position } from '../lib/companions.js'
import { formatDateLong } from '../lib/dates.js'

const AXIS_STEP_SHORT_MAX_YEARS = 8
const AXIS_STEP_MEDIUM_MAX_YEARS = 20

// Beschriftung alle 1/2/5 Jahre, je nach Spannweite der Achse
function axisStep(span) {
  const range = span.to - span.from
  if (range <= AXIS_STEP_SHORT_MAX_YEARS) return 1
  if (range <= AXIS_STEP_MEDIUM_MAX_YEARS) return 2
  return 5
}

function axisYears(span) {
  const step = axisStep(span)
  const years = []
  for (let year = span.from; year <= span.to; year += step) years.push(year)
  if (years[years.length - 1] !== span.to) years.push(span.to)
  return years
}

const HERKUNFT_CHIP_LABELS = {
  tierheim: 'Tierheim',
  privat: 'privat',
  zuechter: 'Züchter',
  nachwuchs: 'Nachwuchs',
  fundtier: 'Fundtier',
  anderes: 'anderes'
}

// "Nele, bei euch seit 12. Juni 2021, aus dem Tierheim" / "…, bei euch von … bis …" - zu Besuch "hier" (where).
function rowAriaLabel(row, where) {
  const name = displayName(row.dog)
  const when = row.ongoing
    ? `${where} seit ${formatDateLong(row.start)}`
    : `${where} von ${formatDateLong(row.start)} bis ${formatDateLong(row.end)}`
  const herkunft = herkunftText(row.dog)
  return herkunft ? `${name}, ${when}, ${herkunft}` : `${name}, ${when}`
}

function barModifierClass(row) {
  if (row.ongoing) return 'is-ongoing'
  if (row.dog.abschied_grund === 'verstorben') return 'is-departed-verstorben'
  return 'is-departed-other'
}

function CompanionRow({ row, span, where }) {
  const startPct = position(row.start, span) * 100
  const endPct = position(row.end, span) * 100
  const width = Math.max(endPct - startPct, 0.6)
  const chip = row.dog.herkunft_art ? HERKUNFT_CHIP_LABELS[row.dog.herkunft_art] : null
  const isMemory = row.departed && row.dog.abschied_grund === 'verstorben'

  return (
    <li className="companion-row">
      <Link to={`/tier/${row.dog.id}`} className="companion-link" aria-label={rowAriaLabel(row, where)}>
        <span className="companion-identity">
          <Avatar dog={row.dog} size={36} />
          <span className="companion-identity-text">
            <span className="companion-name">{displayName(row.dog)}</span>
            <span className="companion-species muted">{speciesSexLabel(row.dog.tierart, row.dog.geschlecht)}</span>
          </span>
        </span>
        <span className="companion-track">
          <span className={`companion-bar ${barModifierClass(row)}`} style={{ left: `${startPct}%`, width: `${width}%` }}>
            {chip && <span className="companion-chip">{chip}</span>}
            {row.ongoing && <span className="companion-bar-label companion-bar-label-today">heute</span>}
            {isMemory && (
              <span className="companion-bar-label companion-bar-label-memory">
                In Erinnerung · {row.start.slice(0, 4)}–{row.end.slice(0, 4)}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  )
}

// Waagrechte Zeitleiste: eine Jahresachse oben, darunter je Tier eine Zeile mit einem Balken
// zwischen Einzug (bzw. Geburt) und Abschied (bzw. heute). where (Audit V7a): "bei euch", zu Besuch "hier".
export default function CompanionTimeline({ rows, span, today, where = 'bei euch' }) {
  const years = axisYears(span)
  const lastIndex = years.length - 1
  const todayPct = position(today, span) * 100

  return (
    <div className="companion-timeline-wrap">
      <ol className="companion-timeline">
        <li className="companion-axis" aria-hidden="true">
          <span className="companion-identity" />
          <span className="companion-track">
            {years.map((year, index) => (
              <span
                key={year}
                className={`companion-axis-label ${index === 0 || index === lastIndex ? 'is-edge' : ''}`}
                style={{ '--pct': position(`${year}-01-01`, span) }}
              >
                {year}
              </span>
            ))}
          </span>
        </li>
        {rows.map((row) => (
          <CompanionRow key={row.dog.id} row={row} span={span} where={where} />
        ))}
      </ol>
      {years.map((year, index) => (
        <span
          key={`grid-${year}`}
          className={`companion-gridline ${index === 0 || index === lastIndex ? 'is-edge' : ''}`}
          style={{ '--pct': position(`${year}-01-01`, span) }}
          aria-hidden="true"
        />
      ))}
      <span className="companion-today-line" style={{ '--pct': todayPct / 100 }} aria-hidden="true" />
    </div>
  )
}

import { formatTagLang } from '../lib/termine.js'

const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

// Datum eines Termins als kleiner Block (Wochentag über Tageszahl) - in der Übersicht des Partners und auf dem Portal,
// jeweils unter einer Monats-Überschrift. Vorgelesen wird das ganze Datum ("Samstag, 10. Oktober").
export default function TerminDate({ datum }) {
  const [year, month, day] = datum.split('-').map(Number)
  const weekday = WEEKDAYS_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return (
    <time className="termin-date" dateTime={datum}>
      <span className="visually-hidden">{formatTagLang(datum)}</span>
      <span className="termin-date-weekday" aria-hidden="true">
        {weekday}
      </span>
      <span className="termin-date-day" aria-hidden="true">
        {day}
      </span>
    </time>
  )
}

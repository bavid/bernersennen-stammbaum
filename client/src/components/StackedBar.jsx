import { formatNumber, stackedSegments } from '../lib/adminStats.js'
import { t } from '../lib/i18n/index.js'

// Verteilungsbalken eines Stapels (AdminStatsStapel): eingelöst | offen | zurückgezogen als gestapelte Segmente,
// nur CSS mit Breite in Prozent und einer 2px-Lücke in der Kartenfläche statt Rahmen. Die Zahlen stehen daneben
// in der Tabelle - der Balken ist für Screenreader ausgeblendet; beim Zeigen nennt title den Wert.
export default function StackedBar({ row }) {
  const segments = stackedSegments(row)
  return (
    <span className="stat-bar" aria-hidden="true">
      {segments.length === 0 && <span className="stat-bar-segment is-leer" style={{ width: '100%' }} />}
      {segments.map((segment) => (
        <span
          key={segment.key}
          className={`stat-bar-segment is-${segment.key}`}
          style={{ width: `${segment.percent}%` }}
          title={`${t(segment.label)}: ${formatNumber(segment.value)}`}
        />
      ))}
    </span>
  )
}

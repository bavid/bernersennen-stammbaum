import { useMemo } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import ThemeMark from '../ThemeMark.jsx'
import CompanionTimeline from '../CompanionTimeline.jsx'
import { companionRows, yearSpan } from '../../lib/companions.js'
import { todayIso } from '../../lib/dates.js'

// Reiter "Zeitleiste" (Phase W, vorher die Seite "Wegbegleiter"): alle Tiere mit Einzugs- oder Geburtsdatum über eine
// gemeinsame Zeitachse. dogs: GET /api/dogs des aktiven Bereichs; where: "bei euch" bzw. zu Besuch "hier";
// readOnly: zu Besuch - der Leerzustand bittet dann nicht ums Eintragen.
export default function CompanionsView({ dogs, where = 'bei euch', readOnly = false }) {
  const { words } = useTheme()
  const today = useMemo(() => todayIso(), [])
  const rows = useMemo(() => companionRows(dogs, today), [dogs, today])
  const span = useMemo(() => yearSpan(rows, today), [rows, today])

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <ThemeMark size={72} />
        <h3>Noch keine Zeitleiste</h3>
        <p>
          {readOnly
            ? `Hier sind noch keine ${words.animals} mit Einzugs- oder Geburtsdatum eingetragen.`
            : `Hier erscheinen eure ${words.animals}, sobald ein Einzugs- oder Geburtsdatum eingetragen ist – ` +
              'tragt bei ihnen ein, seit wann sie bei euch sind.'}
        </p>
      </div>
    )
  }
  return (
    <>
      <p className="muted companions-span">
        {span ? `Alle ${words.animals}, die ${where} gelebt haben und leben – seit ${span.from}.` : null}
      </p>
      <CompanionTimeline rows={rows} span={span} today={today} where={where} />
    </>
  )
}

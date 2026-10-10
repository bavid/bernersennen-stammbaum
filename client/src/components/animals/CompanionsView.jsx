import { useMemo } from 'react'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import ThemeMark from '../ThemeMark.jsx'
import CompanionTimeline from '../CompanionTimeline.jsx'
import { companionRows, yearSpan } from '../../lib/companions.js'
import { todayIso } from '../../lib/dates.js'
import { t } from '../../lib/i18n/index.js'

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
        <h3>{t('Noch keine Zeitleiste')}</h3>
        <p>
          {readOnly
            ? t('Hier sind noch keine {animals} mit Einzugs- oder Geburtsdatum eingetragen.', { animals: words.animals })
            : t('Hier erscheinen eure {animals}, sobald ein Einzugs- oder Geburtsdatum eingetragen ist – tragt bei ihnen ein, seit wann sie bei euch sind.', { animals: words.animals })}
        </p>
      </div>
    )
  }
  return (
    <>
      <p className="muted companions-span">
        {span ? t('Alle {animals}, die {where} gelebt haben und leben – seit {year}.', { animals: words.animals, where: t(where), year: span.from }) : null}
      </p>
      <CompanionTimeline rows={rows} span={span} today={today} where={where} />
    </>
  )
}

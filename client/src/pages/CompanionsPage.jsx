import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import ThemeMark from '../components/ThemeMark.jsx'
import CompanionTimeline from '../components/CompanionTimeline.jsx'
import { companionRows, nextAnniversary, yearSpan, yearsTogether } from '../lib/companions.js'
import { displayName } from '../lib/timeline.js'
import { todayIso } from '../lib/dates.js'

const ANNIVERSARY_WINDOW_DAYS = 30

// "In 5 Tagen: Nele ist 5 Jahre bei euch" / "Heute: Nele ist 5 Jahre bei euch!"
function anniversaryText(anniversary) {
  const name = displayName(anniversary.dog)
  const years = `${anniversary.years} ${anniversary.years === 1 ? 'Jahr' : 'Jahre'}`
  if (anniversary.daysUntil === 0) return `Heute: ${name} ist ${years} bei euch!`
  const days = `${anniversary.daysUntil} ${anniversary.daysUntil === 1 ? 'Tag' : 'Tagen'}`
  return `In ${days}: ${name} ist ${years} bei euch`
}

// „Meine Chronik“ – alle Wegbegleiter des eigenen Zuhauses über eine gemeinsame Zeitachse.
// eslint-disable-next-line no-unused-vars -- `family` gehört zur Seiten-Signatur (wie bei den anderen Bereichs-Seiten),
// wird hier aber noch nicht ausgewertet
export default function CompanionsPage({ family }) {
  const { words } = useTheme()
  const [dogs, setDogs] = useState(null)
  const [error, setError] = useState(null)
  const today = useMemo(() => todayIso(), [])

  useEffect(() => {
    api
      .listDogs()
      .then(setDogs)
      .catch((err) => setError(err.message))
  }, [])

  const rows = useMemo(() => companionRows(dogs || [], today), [dogs, today])
  const span = useMemo(() => yearSpan(rows, today), [rows, today])
  const anniversary = useMemo(() => nextAnniversary(dogs || [], today), [dogs, today])
  const livingCount = useMemo(() => rows.filter((row) => row.ongoing).length, [rows])
  const years = useMemo(() => yearsTogether(rows), [rows])

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">Meine Chronik</span>
          <h1>Wegbegleiter</h1>
          <p className="page-lede">
            {span
              ? `Alle ${words.animals}, die bei euch gelebt haben und leben – seit ${span.from}.`
              : `Alle ${words.animals}, die bei euch gelebt haben und leben.`}
          </p>
          <p className="companions-hint">
            {words.TheGroup} pflegst du im <Link to="/stammbaum">Stammbaum</Link>.
          </p>
        </div>
        {rows.length > 0 && (
          <div className="page-hero-side">
            <dl className="stats">
              <div>
                <dt>{words.animals} gesamt</dt>
                <dd>{rows.length}</dd>
              </div>
              <div>
                <dt>leben bei euch</dt>
                <dd>{livingCount}</dd>
              </div>
              <div>
                <dt>{years === 1 ? 'Jahr' : 'Jahre'} gemeinsam</dt>
                <dd>{years}</dd>
              </div>
            </dl>
          </div>
        )}
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {anniversary && anniversary.daysUntil <= ANNIVERSARY_WINDOW_DAYS && (
        <div className="companions-anniversary">
          <p>{anniversaryText(anniversary)}</p>
        </div>
      )}

      {dogs && rows.length === 0 && (
        <div className="empty-state">
          <ThemeMark size={72} />
          <h3>Noch keine Wegbegleiter</h3>
          <p>
            Noch keine Wegbegleiter mit Einzugs- oder Geburtsdatum. Trag bei deinen Tieren ein, seit wann sie bei euch
            sind.
          </p>
        </div>
      )}

      {dogs && rows.length > 0 && <CompanionTimeline rows={rows} span={span} today={today} />}
    </div>
  )
}

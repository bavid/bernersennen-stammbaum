import { useEffect, useState } from 'react'
import { api } from '../api'
import StatTile from './StatTile.jsx'
import AdminStatsStapel from './AdminStatsStapel.jsx'
import AdminStatsPartnerRanking from './AdminStatsPartnerRanking.jsx'
import AdminStatsMundpropaganda from './AdminStatsMundpropaganda.jsx'
import AdminStatsKlicks from './AdminStatsKlicks.jsx'
import AdminStatsPartnerStatus from './AdminStatsPartnerStatus.jsx'
import { eingeloesteGesamt, klicksLetzteTage } from '../lib/adminStats.js'

// „Kennzahlen“ (Phase 5 Task 3, seit Phase U im Reiter „Übersicht“): Kennzahlen, Gutschein-Stapel, Partner-Ranking,
// Mundpropaganda, Klicks und Partner-Status aus GET /api/admin/stats (server/lib/adminStats.js, ohne Demo-Daten).
// bereiche kommt aus der Übersicht der AdminPage (overview.stats.families); fehlt der Wert, entfällt die Kachel.
export default function AdminStats({ bereiche }) {
  const [stats, setStats] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.admin
      .stats()
      .then((data) => {
        if (cancelled) return
        setStats(data)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="admin-overview card" aria-labelledby="admin-overview-title">
      <div className="admin-section-head">
        <h2 id="admin-overview-title">Kennzahlen</h2>
      </div>
      <p className="admin-section-intro muted">
        Zahlen ohne Demo-Daten: Einlösungen der Einladungscodes, Weitergaben, Klicks der letzten 30 Tage und der Stand der
        Partner.
      </p>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {stats === undefined && !error && <p className="muted">Lade …</p>}
      {stats && <StatsBody stats={stats} bereiche={bereiche} />}
    </section>
  )
}

function StatsBody({ stats, bereiche }) {
  const { einloesungen, mundpropaganda, klicks, partner } = stats

  return (
    <>
      <dl className="admin-stats admin-stats-kennzahlen">
        {Number.isFinite(bereiche) && <StatTile label="Bereiche" value={bereiche} />}
        <StatTile label="Partner aktiv" value={partner?.status?.aktiv} />
        <StatTile label="Eingelöste Einladungscodes" value={eingeloesteGesamt(einloesungen?.zweck)} />
        <StatTile label="Klicks 7 Tage" value={klicksLetzteTage(klicks?.tage)} />
      </dl>

      <div className="admin-overview-grid">
        <StatsBlock id="stapel" title="Code-Stapel" wide hint="Eingelöst, offen und zurückgezogen je Stapel des Admins.">
          <AdminStatsStapel stapel={einloesungen?.stapel} />
        </StatsBlock>
        <StatsBlock id="partner-ranking" title="Partner-Ranking" hint="Neue Bereiche, die über einen Partner entstanden.">
          <AdminStatsPartnerRanking partner={einloesungen?.partner} />
        </StatsBlock>
        <StatsBlock id="mundpropaganda" title="Mundpropaganda" hint="Weitergegebene Einladungscodes, aus denen neue Bereiche wurden.">
          <AdminStatsMundpropaganda mundpropaganda={mundpropaganda} />
        </StatsBlock>
        <StatsBlock id="klicks" title="Klicks" wide hint="Letzte 30 Tage, darunter die meistgeklickten Ziele.">
          <AdminStatsKlicks klicks={klicks} />
        </StatsBlock>
        <StatsBlock id="partner-status" title="Partner-Status" wide>
          <AdminStatsPartnerStatus partner={partner} />
        </StatsBlock>
      </div>
    </>
  )
}

// Ein Block der Übersicht: kleine Überschrift wie die Abschnitte in AdminFamilyDetails, optional ein Hinweis.
function StatsBlock({ id, title, hint, wide = false, children }) {
  const titleId = `admin-overview-${id}-title`
  return (
    <section className={`admin-overview-block ${wide ? 'is-wide' : ''}`} aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      {hint && <p className="admin-overview-hint muted">{hint}</p>}
      {children}
    </section>
  )
}

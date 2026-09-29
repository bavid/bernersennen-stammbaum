import { barPercent, plural, topPartner } from '../lib/adminStats.js'

// Partner-Ranking der Übersicht: die fünf Partner mit den meisten neuen Bereichen (Zuhause, die über einen
// Partner-Stapel oder eine Weitergabe aus seinem Bereich entstanden), je Zeile ein schmaler Balken relativ zum
// Spitzenreiter - eine Reihe, eine Farbe (Rost). Partner ohne neue Bereiche erscheinen nicht.
export default function AdminStatsPartnerRanking({ partner }) {
  const top = topPartner(partner)
  if (top.length === 0) return <p className="muted">Noch keine Bereiche über Partner</p>
  const max = top[0].neueBereiche

  return (
    <ol className="stat-ranking">
      {top.map((row) => (
        <li key={row.partnerId}>
          <span className="stat-ranking-name">{row.name}</span>
          <span className="stat-ranking-bar" aria-hidden="true">
            <span style={{ width: `${barPercent(row.neueBereiche, max)}%` }} />
          </span>
          <span className="stat-ranking-value">{plural(row.neueBereiche, 'Bereich', 'Bereiche')}</span>
        </li>
      ))}
    </ol>
  )
}

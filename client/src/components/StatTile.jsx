import { formatNumber } from '../lib/adminStats.js'

// Kennzahl-Kachel der Übersicht (AdminStats) - dieselbe dt/dd-Bauweise und Optik wie StatsGrid in AdminPage
// (.admin-stats), damit beide Reihen zusammenpassen. value ist eine Zahl (de-DE), hint ein kleiner Zusatz.
export default function StatTile({ label, value, hint }) {
  return (
    <div className="admin-stat-tile">
      <dt>{label}</dt>
      <dd>
        {formatNumber(value)}
        {hint && <small>{hint}</small>}
      </dd>
    </div>
  )
}

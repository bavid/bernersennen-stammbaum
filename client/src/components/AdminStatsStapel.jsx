import StackedBar from './StackedBar.jsx'
import ZweckBadge from './ZweckBadge.jsx'
import { SEGMENTE, formatNumber } from '../lib/adminStats.js'

// Gutschein-Stapel in der Übersicht: je Stapel Bezeichnung, Zweck, Verteilungsbalken und die drei Zahlen. Die
// Farbpunkte in den Spaltenköpfen sind die Legende des Balkens - Identität nie nur über Farbe. Abgelaufene
// Gutscheine zählen wie in der Stapel-Liste in keiner Spalte mit (size ist die Gesamtzahl der Codes).
export default function AdminStatsStapel({ stapel }) {
  if (!stapel || stapel.length === 0) return <p className="muted">Noch keine Stapel</p>

  return (
    <div className="admin-table-scroll">
      <table className="admin-table stat-table">
        <thead>
          <tr>
            <th scope="col">Stapel</th>
            <th scope="col">Zweck</th>
            <th scope="col" className="stat-table-bar">
              Verteilung
            </th>
            {SEGMENTE.map((segment) => (
              <th key={segment.key} scope="col" className="stat-num">
                <span className={`stat-dot is-${segment.key}`} aria-hidden="true" />
                {segment.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stapel.map((row) => (
            <tr key={row.id} className="stat-stapel-row">
              <th scope="row">
                {row.label}
                <span className="muted"> · {formatNumber(row.size)} Codes</span>
              </th>
              <td>
                <ZweckBadge batch={row} />
              </td>
              <td className="stat-table-bar">
                <StackedBar row={row} />
              </td>
              {SEGMENTE.map((segment) => (
                <td key={segment.key} className="stat-num">
                  {formatNumber(row[segment.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import Sparkline from './Sparkline.jsx'
import { formatNumber } from '../lib/adminStats.js'

// Klicks in der Übersicht: Sparkline der letzten 30 Tage (mit Textalternative, siehe Sparkline) und darunter
// die zehn meistgeklickten Ziele (Anzeigen, Partner-Links, Unterstützen) mit 7 Tagen, 30 Tagen und gesamt.
export default function AdminStatsKlicks({ klicks }) {
  const { tage = [], top = [] } = klicks ?? {}

  return (
    <>
      {tage.length > 0 && <Sparkline tage={tage} />}
      {top.length === 0 ? (
        <p className="muted">Noch keine Klicks</p>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-table stat-table">
            <thead>
              <tr>
                <th scope="col">Ziel</th>
                <th scope="col" className="stat-num">
                  7 Tage
                </th>
                <th scope="col" className="stat-num">
                  30 Tage
                </th>
                <th scope="col" className="stat-num">
                  Gesamt
                </th>
              </tr>
            </thead>
            <tbody>
              {top.map((ziel) => (
                <tr key={`${ziel.targetType}-${ziel.targetId}`} className="stat-klick-row">
                  <th scope="row">{ziel.titel || ziel.targetType}</th>
                  <td className="stat-num">{formatNumber(ziel.klicks7)}</td>
                  <td className="stat-num">{formatNumber(ziel.klicks30)}</td>
                  <td className="stat-num">{formatNumber(ziel.gesamt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

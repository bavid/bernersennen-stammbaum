import { SPARKLINE, formatNumber, formatTagKurz, plural, sparklineGeometry, sparklineSummary } from '../lib/adminStats.js'

// Sparkline der Klicks je Tag (AdminStatsKlicks) - reines SVG ohne Bibliothek: 2px-Linie in currentColor
// (Rost, über die Karte gesetzt), zarte Fläche darunter, Endpunkt mit Ring in der Kartenfläche, Grundlinie als
// Haarlinie. Textalternative zweifach: aria-label mit den Summen und eine visuell verborgene Tabelle mit den
// Tageswerten. Je Tag eine unsichtbare Trefferfläche mit <title>, damit der Wert auch beim Zeigen erscheint.
export default function Sparkline({ tage, size = SPARKLINE }) {
  const rows = tage ?? []
  const { points, line, area, baselineY, last } = sparklineGeometry(rows, size)
  const step = points.length > 1 ? points[1].x - points[0].x : size.width
  const first = rows[0]
  const latest = rows[rows.length - 1]

  return (
    <figure className="stat-sparkline">
      <svg
        className="stat-sparkline-svg"
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label={sparklineSummary(rows)}
        focusable="false"
      >
        <line className="stat-sparkline-baseline" x1={size.pad} x2={size.width - size.pad} y1={baselineY} y2={baselineY} vectorEffect="non-scaling-stroke" />
        {area && <path className="stat-sparkline-area" d={area} />}
        {line && <path className="stat-sparkline-line" d={line} vectorEffect="non-scaling-stroke" />}
        {last && <circle className="stat-sparkline-dot" cx={last.x} cy={last.y} r="4" vectorEffect="non-scaling-stroke" />}
        {points.map((point, index) => (
          <rect key={rows[index].tag} className="stat-sparkline-hit" x={point.x - step / 2} y="0" width={step} height={size.height}>
            <title>{`${formatTagKurz(rows[index].tag)} ${plural(rows[index].anzahl, 'Klick', 'Klicks')}`}</title>
          </rect>
        ))}
      </svg>
      {first && latest && (
        <figcaption className="stat-sparkline-axis muted" aria-hidden="true">
          <span>{formatTagKurz(first.tag)}</span>
          <span>{formatTagKurz(latest.tag)}</span>
        </figcaption>
      )}
      <table className="visually-hidden">
        <caption>Klicks je Tag</caption>
        <thead>
          <tr>
            <th scope="col">Tag</th>
            <th scope="col">Klicks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tag}>
              <th scope="row">{formatTagKurz(row.tag)}</th>
              <td>{formatNumber(row.anzahl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

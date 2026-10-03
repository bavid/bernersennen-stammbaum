import { VERLAUF_SIZE, formatDateTime, seriesGeometry, seriesSummary, verlaufSeries } from '../lib/adminServer.js'

// Eine Verlaufslinie (reines SVG, keine Bibliothek): 2px-Linie in currentColor, die Warnschwelle gestrichelt, Endpunkt mit
// Ring in der Kartenfläche. Das SVG ist nur Schmuck (aria-hidden) - die Textalternative steht sichtbar darunter: letzter,
// niedrigster und höchster Wert in Worten.
function VerlaufChart({ series, size = VERLAUF_SIZE }) {
  const { line, last, yOf, baselineY } = seriesGeometry(series.values, series, size)
  const titleId = `admin-server-verlauf-${series.key}`
  const thresholdY = yOf(series.schwelle)
  return (
    <figure className="server-verlauf-chart" aria-labelledby={titleId}>
      <h4 id={titleId}>{series.label}</h4>
      <svg className="server-verlauf-svg" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true" focusable="false">
        <line className="server-verlauf-baseline" x1={size.pad} x2={size.width - size.pad} y1={baselineY} y2={baselineY} vectorEffect="non-scaling-stroke" />
        <line className="server-verlauf-threshold" x1={size.pad} x2={size.width - size.pad} y1={thresholdY} y2={thresholdY} vectorEffect="non-scaling-stroke" />
        {line && <path className="server-verlauf-line" d={line} vectorEffect="non-scaling-stroke" />}
        {last && <circle className="server-verlauf-dot" cx={last.x} cy={last.y} r="3.5" vectorEffect="non-scaling-stroke" />}
      </svg>
      <figcaption>
        <p className="server-verlauf-text">{seriesSummary(series.label, series.values, series.format)}</p>
        <p className="server-verlauf-legend muted">Gestrichelt: Warnschwelle {series.format(series.schwelle)}</p>
      </figcaption>
    </figure>
  )
}

// Verlauf der letzten 30 Tage (stündliche Messungen): Arbeitsspeicher frei, Speicherplatz frei, Last.
export default function AdminServerVerlauf({ status }) {
  const verlauf = status.verlauf ?? []
  const first = verlauf[0]
  const latest = verlauf[verlauf.length - 1]
  return (
    <section className="admin-server-verlauf" aria-labelledby="admin-server-verlauf-title">
      <div className="admin-server-verlauf-head">
        <h3 id="admin-server-verlauf-title">Verlauf</h3>
        {first && latest && (
          <p className="muted">
            {formatDateTime(first.at)} bis {formatDateTime(latest.at)} · stündlich, 30 Tage
          </p>
        )}
      </div>
      {verlauf.length === 0 ? (
        <p className="server-verlauf-empty muted">Noch keine Messungen – der Verlauf füllt sich stündlich.</p>
      ) : (
        <div className="server-verlauf-list">
          {verlaufSeries(verlauf, status.schwellen, status.last?.kerne).map((series) => (
            <VerlaufChart key={series.key} series={series} />
          ))}
        </div>
      )}
    </section>
  )
}

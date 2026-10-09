import { formatEuroCents } from '../../lib/discover.js'
import { balkenBreiten, quartalLabel, quartalSummen } from '../../lib/finanzierung.js'

// Phase F: „Zahlen je Quartal“ auf /finanzierung (und als Vorschau im Admin): je Quartal drei kleine Balken - Einnahmen
// (Spenden und Partner zusammen), Kosten des Betriebs, weitergegebene Spenden - an EINER Skala über alle Quartale. Keine
// Diagramm-Bibliothek: eine Liste mit Beschreibungsliste je Quartal, die Balken sind reine Darstellung (aria-hidden), die
// Zahlen stehen als Text daneben. Ohne Quartale der ruhige Leerzustand.
// verteilung (optional, GET /api/finanzierung): je Quartal die Spendenrechnung (server/lib/finanzierungVerteilung.js) -
// dann zählen bei „Kosten“ auch die laufenden Posten, und eine Zeile nennt Rücklage und Spendenanteil des Überschusses.

export const QUARTALE_LEER = 'Die ersten Zahlen veröffentlichen wir nach dem ersten Quartal.'

const ROWS = [
  { key: 'einnahmen', label: 'Einnahmen' },
  { key: 'kosten', label: 'Kosten' },
  { key: 'weitergegeben', label: 'Weitergegeben' }
]

function VerteilungZeile({ zeile }) {
  if (!zeile) return null
  if (!zeile.ueberschussCents) {
    return <p className="finanz-quartal-verteilung">Kein Überschuss in diesem Quartal – nichts zu verteilen.</p>
  }
  return (
    <p className="finanz-quartal-verteilung">
      Überschuss {formatEuroCents(zeile.ueberschussCents)}: Rücklage {formatEuroCents(zeile.reserveCents)} ({zeile.anteilProzent} %) · zum Spenden{' '}
      {formatEuroCents(zeile.gespendetCents)}
      {zeile.entnahmeCents > 0 && <> · aus der Rücklage entnommen {formatEuroCents(zeile.entnahmeCents)}</>}
    </p>
  )
}

function QuartalRow({ quartal, breiten, zeile }) {
  const summen = quartalSummen(quartal)
  return (
    <li className="finanz-quartal">
      <h3 className="finanz-quartal-title">{quartalLabel(quartal.jahr, quartal.quartal)}</h3>
      <dl className="finanz-quartal-rows">
        {ROWS.map((row) => (
          <div key={row.key} className={`finanz-row is-${row.key}`}>
            <dt>{row.label}</dt>
            <dd>
              <span className="finanz-bar" aria-hidden="true">
                <span className="finanz-bar-fill" style={{ width: `${breiten[row.key]}%` }} />
              </span>
              <span className="finanz-value">{formatEuroCents(summen[row.key])}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="finanz-quartal-detail">
        Spenden {formatEuroCents(quartal.einnahmenSpendenCents)} · Partner {formatEuroCents(quartal.einnahmenPartnerCents)}
        {quartal.notiz && <> · {quartal.notiz}</>}
      </p>
      <VerteilungZeile zeile={zeile} />
    </li>
  )
}

// Mit Verteilung: die Kosten des Quartals samt laufender Posten (wie die Rechnung des Servers).
function mitVerteilung(quartale, verteilung) {
  const zeilen = new Map((verteilung || []).map((zeile) => [`${zeile.jahr}-${zeile.quartal}`, zeile]))
  return quartale.map((quartal) => {
    const zeile = zeilen.get(`${quartal.jahr}-${quartal.quartal}`) || null
    return { quartal: zeile ? { ...quartal, kostenCents: zeile.kostenCents } : quartal, zeile }
  })
}

export default function FinanzierungQuartale({ quartale, verteilung = null }) {
  if (!quartale?.length) {
    return (
      <p className="finanz-empty" role="note">
        {QUARTALE_LEER}
      </p>
    )
  }
  const rows = mitVerteilung(quartale, verteilung)
  const breiten = balkenBreiten(rows.map((row) => row.quartal))
  return (
    <ul className="finanz-quartale" aria-label="Zahlen je Quartal">
      {rows.map(({ quartal, zeile }, index) => (
        <QuartalRow key={`${quartal.jahr}-${quartal.quartal}`} quartal={quartal} breiten={breiten[index]} zeile={zeile} />
      ))}
    </ul>
  )
}

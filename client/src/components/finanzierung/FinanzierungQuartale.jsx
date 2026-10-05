import { formatEuroCents } from '../../lib/discover.js'
import { balkenBreiten, quartalLabel, quartalSummen } from '../../lib/finanzierung.js'

// Phase F: „Zahlen je Quartal“ auf /finanzierung (und als Vorschau im Admin): je Quartal drei kleine Balken - Einnahmen
// (Spenden und Partner zusammen), Kosten des Betriebs, weitergegebene Spenden - an EINER Skala über alle Quartale. Keine
// Diagramm-Bibliothek: eine Liste mit Beschreibungsliste je Quartal, die Balken sind reine Darstellung (aria-hidden), die
// Zahlen stehen als Text daneben. Ohne Quartale der ruhige Leerzustand.

export const QUARTALE_LEER = 'Die ersten Zahlen veröffentlichen wir nach dem ersten Quartal.'

const ROWS = [
  { key: 'einnahmen', label: 'Einnahmen' },
  { key: 'kosten', label: 'Kosten' },
  { key: 'weitergegeben', label: 'Weitergegeben' }
]

function QuartalRow({ quartal, breiten }) {
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
    </li>
  )
}

export default function FinanzierungQuartale({ quartale }) {
  if (!quartale?.length) {
    return (
      <p className="finanz-empty" role="note">
        {QUARTALE_LEER}
      </p>
    )
  }
  const breiten = balkenBreiten(quartale)
  return (
    <ul className="finanz-quartale" aria-label="Zahlen je Quartal">
      {quartale.map((quartal, index) => (
        <QuartalRow key={`${quartal.jahr}-${quartal.quartal}`} quartal={quartal} breiten={breiten[index]} />
      ))}
    </ul>
  )
}

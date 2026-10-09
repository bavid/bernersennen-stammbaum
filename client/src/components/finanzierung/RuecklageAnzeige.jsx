import { formatEuroCents } from '../../lib/discover.js'
import { ruecklageFuellstand, ruecklageText } from '../../lib/finanzierungRuecklage.js'

// „Rücklage: deckt 0,4 Jahre“ - die Rücklage „Server-Zukunft“ als kleine, ruhige Anzeige: Satz, Balken (drei Jahre = voll,
// ab dann geht alles an Spenden) und darunter Betrag und aktueller Anteil. Nur Darstellung (read-only) - für /finanzierung,
// die Admin-Karte „Kosten & Reserve“ und später die Präsentation. ruecklage: { centsAktuell, jahreGedeckt, anteilProzent }
// aus GET /api/finanzierung. Der Balken ist reine Darstellung (aria-hidden), alles Wichtige steht als Text da.
export default function RuecklageAnzeige({ ruecklage, className = '' }) {
  if (!ruecklage) return null
  const fuellstand = ruecklageFuellstand(ruecklage.jahreGedeckt)
  return (
    <div className={`ruecklage-anzeige ${className}`.trim()}>
      <p className="ruecklage-anzeige-text">
        <strong>{ruecklageText(ruecklage)}</strong>
      </p>
      <span className="ruecklage-anzeige-bar" aria-hidden="true">
        <span className="ruecklage-anzeige-fill" style={{ width: `${fuellstand}%` }} />
        <span className="ruecklage-anzeige-mark is-1" />
        <span className="ruecklage-anzeige-mark is-2" />
      </span>
      <p className="ruecklage-anzeige-detail">
        Server-Zukunft: {formatEuroCents(ruecklage.centsAktuell)} · vom Überschuss gehen zurzeit {ruecklage.anteilProzent} % in die Rücklage
      </p>
    </div>
  )
}

import { REGEL_STUFEN, REGEL_TEXT } from '../../lib/finanzierungRuecklage.js'
import RuecklageAnzeige from './RuecklageAnzeige.jsx'

// Die Spendenrechnung in einfachen Worten („Vom Überschuss legen wir anfangs 20 % …“) und die vier Stufen als kleine
// Leiste - nur Darstellung (read-only), wiederverwendbar auf /finanzierung, im Admin und später in der Präsentation.
// ruecklage (optional, aus GET /api/finanzierung): markiert die geltende Stufe (aria-current) und zeigt darunter die
// RuecklageAnzeige; ohne ruecklage nur Regel und Stufen.
export default function FinanzierungRegel({ ruecklage = null, className = '' }) {
  const aktuell = ruecklage ? ruecklage.anteilProzent : null
  return (
    <div className={`finanz-regel ${className}`.trim()}>
      <span className="hand finanz-regel-hand">Rücklage Server-Zukunft</span>
      <p className="finanz-regel-text">{REGEL_TEXT}</p>
      <ol className="finanz-regel-stufen" aria-label="Anteil für die Rücklage">
        {REGEL_STUFEN.map((stufe) => (
          <li key={stufe.prozent} className={aktuell === stufe.prozent ? 'is-aktuell' : undefined} aria-current={aktuell === stufe.prozent ? 'step' : undefined}>
            <span className="finanz-regel-stufe-label">{stufe.label}</span>
            <strong>{stufe.prozent > 0 ? `${stufe.prozent} %` : 'alles gespendet'}</strong>
          </li>
        ))}
      </ol>
      {ruecklage && <RuecklageAnzeige ruecklage={ruecklage} />}
    </div>
  )
}

import { REGEL_STUFEN, REGEL_TEXT } from '../../lib/finanzierungRuecklage.js'
import RuecklageAnzeige from './RuecklageAnzeige.jsx'
import { t } from '../../lib/i18n/index.js'

// Die Spendenrechnung in einfachen Worten („Vom Überschuss legen wir anfangs 20 % …“) und die vier Stufen als kleine
// Leiste - nur Darstellung (read-only), wiederverwendbar auf /finanzierung, im Admin und später in der Präsentation.
// ruecklage (optional, aus GET /api/finanzierung): markiert die geltende Stufe (aria-current) und zeigt darunter die
// RuecklageAnzeige; ohne ruecklage nur Regel und Stufen.
export default function FinanzierungRegel({ ruecklage = null, className = '' }) {
  const aktuell = ruecklage ? ruecklage.anteilProzent : null
  return (
    <div className={`finanz-regel ${className}`.trim()}>
      <span className="hand finanz-regel-hand">{t('Rücklage Server-Zukunft')}</span>
      <p className="finanz-regel-text">{t(REGEL_TEXT)}</p>
      <ol className="finanz-regel-stufen" aria-label={t('Anteil für die Rücklage')}>
        {REGEL_STUFEN.map((stufe) => (
          <li key={stufe.prozent} className={aktuell === stufe.prozent ? 'is-aktuell' : undefined} aria-current={aktuell === stufe.prozent ? 'step' : undefined}>
            <span className="finanz-regel-stufe-label">{t(stufe.label)}</span>
            <strong>{stufe.prozent > 0 ? `${stufe.prozent} %` : t('alles gespendet')}</strong>
          </li>
        ))}
      </ol>
      {ruecklage && <RuecklageAnzeige ruecklage={ruecklage} />}
    </div>
  )
}

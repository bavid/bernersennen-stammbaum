import Icon from '../Icon.jsx'
import { isSafeHttpUrl } from '../../lib/finanzierung.js'

// Phase F: die ruhige Karte „Mithelfen“ auf /finanzierung (und als Vorschau im Admin) - der Spenden-Hinweis, den der
// Admin eingetragen hat: ein Text (z. B. Spendenkonto und Verwendungszweck, Zeilenumbrüche bleiben) und/oder ein
// externer Spenden-Link (neuer Tab, rel noopener noreferrer, nur http(s)). Nie ein Zahlungsformular in der App. Ohne
// Eintrag erscheint die Karte gar nicht.
export default function FinanzierungMithelfen({ hinweis }) {
  const text = hinweis?.text?.trim() || ''
  const url = isSafeHttpUrl(hinweis?.url) ? hinweis.url : null
  if (!text && !url) return null
  return (
    <section className="card finanz-mithelfen" aria-labelledby="finanz-mithelfen-title">
      <span className="hand finanz-mithelfen-hand">Danke fürs Mithelfen</span>
      <h2 id="finanz-mithelfen-title">Mithelfen</h2>
      <p className="finanz-mithelfen-lede">Jede Spende hält die Server am Laufen – was übrig bleibt, geht an Tiere und lokale Projekte.</p>
      {text && (
        <p className="finanz-mithelfen-text">
          {text.split('\n').map((line, index) => (
            <span key={index}>
              {index > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
      )}
      {url && (
        <a className="btn btn-primary finanz-mithelfen-link" href={url} target="_blank" rel="noopener noreferrer">
          <Icon name="external" />
          Zur Spendenseite
          <span className="visually-hidden"> (öffnet in neuem Tab)</span>
        </a>
      )}
    </section>
  )
}

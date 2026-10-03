import Icon from '../Icon.jsx'
import { CARDS_PER_SHEET, MAX_SHEETS, MIN_SHEETS } from '../../lib/visitenkarte.js'
import { SEITEN } from './VisitenkartenBogen.jsx'

// Drucken (Phase V5): wie viele A4-Bögen (je 10 Karten), welche Seiten und der Druck-Knopf (window.print() - gedruckt
// wird die Druckfassung aus VisitenkartenBogen.jsx). Dazu die Hinweise für den beidseitigen Druck. blockedHint: warum
// gerade nicht gedruckt werden kann (z. B. "Erst die Gutscheine holen").

export const PRINT_HINT = 'Rückseiten: Blatt umdrehen über die kurze Kante.'
const SHEET_OPTIONS = Array.from({ length: MAX_SHEETS - MIN_SHEETS + 1 }, (_, index) => MIN_SHEETS + index)
const SEITEN_OPTIONS = [
  { value: SEITEN.beide, label: 'Beide Seiten' },
  { value: SEITEN.vorne, label: 'Nur vorne' },
  { value: SEITEN.hinten, label: 'Nur hinten' }
]

export default function VisitenkarteDruckOptionen({ sheets, onSheets, seiten, onSeiten, blockedHint, publicUrlWarning }) {
  return (
    <section className="vk-panel" aria-labelledby="vk-druck-title">
      <h2 id="vk-druck-title" className="vk-panel-title">
        Drucken
      </h2>
      <div className="field">
        <span className="vk-label" id="vk-boegen-label">
          A4-Bögen
        </span>
        <div className="segmented vk-segmented" role="group" aria-labelledby="vk-boegen-label">
          {SHEET_OPTIONS.map((count) => (
            <button key={count} type="button" aria-pressed={sheets === count} onClick={() => onSheets(count)}>
              {count}
            </button>
          ))}
        </div>
        <p className="field-hint">
          {sheets * CARDS_PER_SHEET} Karten · je Bogen {CARDS_PER_SHEET} Karten (2 × 5) mit Schnittmarken
        </p>
      </div>
      <div className="field">
        <span className="vk-label" id="vk-seiten-label">
          Seiten
        </span>
        <div className="segmented vk-segmented" role="group" aria-labelledby="vk-seiten-label">
          {SEITEN_OPTIONS.map((option) => (
            <button key={option.value} type="button" aria-pressed={seiten === option.value} onClick={() => onSeiten(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <p className="field-hint">„Nur vorne“ und „Nur hinten“ für Drucker ohne Duplex: erst alle Vorderseiten, dann den Stapel umdrehen.</p>
      </div>
      {publicUrlWarning}
      <button type="button" className="btn btn-primary btn-lg vk-print-button" onClick={() => window.print()} disabled={Boolean(blockedHint)}>
        <Icon name="printer" /> Drucken
      </button>
      {blockedHint && (
        <p className="field-hint" role="note">
          {blockedHint}
        </p>
      )}
      <ul className="vk-druck-hints">
        <li>
          <strong>{PRINT_HINT}</strong> Bei „Beide Seiten“ folgt jedem Vorderseiten-Bogen sein Rückseiten-Bogen; die Rückseiten
          laufen gespiegelt, damit jede hinter ihrer Karte liegt.
        </li>
        <li>Im Druckdialog „Tatsächliche Größe“ bzw. 100 % wählen – sonst stimmen Kartenmaß und Schnittmarken nicht.</li>
        <li>Festes Papier (ab 250 g/m²) wirkt wie eine echte Visitenkarte. Geschnitten wird an den Marken.</li>
      </ul>
    </section>
  )
}

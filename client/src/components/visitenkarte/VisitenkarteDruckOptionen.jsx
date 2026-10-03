import Icon from '../Icon.jsx'
import { CARDS_PER_SHEET, MAX_SHEETS, MIN_SHEETS } from '../../lib/visitenkarte.js'
import { SEITEN } from './VisitenkartenBogen.jsx'

// Drucken (Phase V5): wie viele A4-Bögen (je 10 Karten), welche Seiten und der Druck-Knopf (onPrint - mit Kunden-Gutschein
// holt er erst die Codes, dann druckt der Browser die Druckfassung aus VisitenkartenBogen.jsx). gutscheinAnzahl: wie
// viele Karten dieses Drucks einen eigenen Gutschein bekommen (0 = keine). Dazu die Hinweise für den beidseitigen Druck:
// die Rückseiten laufen je Reihe gespiegelt (lib/visitenkarte.js mirrorRows) - das passt zum Wenden über die lange Kante.

export const PRINT_HINT = 'Rückseiten: Duplex über die lange Kante – bei manuellem Druck das Blatt seitlich umdrehen.'
const SHEET_OPTIONS = Array.from({ length: MAX_SHEETS - MIN_SHEETS + 1 }, (_, index) => MIN_SHEETS + index)
const SEITEN_OPTIONS = [
  { value: SEITEN.beide, label: 'Beide Seiten' },
  { value: SEITEN.vorne, label: 'Nur vorne' },
  { value: SEITEN.hinten, label: 'Nur hinten' }
]

function printLabel(busy, gutscheinAnzahl) {
  if (busy) return 'Hole Gutscheine …'
  if (gutscheinAnzahl === 0) return 'Drucken'
  return `Drucken – mit ${gutscheinAnzahl} ${gutscheinAnzahl === 1 ? 'Gutschein' : 'Gutscheinen'}`
}

export default function VisitenkarteDruckOptionen({ sheets, onSheets, seiten, onSeiten, onPrint, busy, gutscheinAnzahl, publicUrlWarning }) {
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
        <p className="field-hint">
          „Nur vorne“ und „Nur hinten“ für Drucker ohne Duplex: erst alle Vorderseiten drucken, den Stapel seitlich (über die
          lange Kante) umdrehen, dann die Rückseiten.
        </p>
      </div>
      {publicUrlWarning}
      <button type="button" className="btn btn-primary btn-lg vk-print-button" onClick={onPrint} disabled={busy}>
        <Icon name="printer" /> {printLabel(busy, gutscheinAnzahl)}
      </button>
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

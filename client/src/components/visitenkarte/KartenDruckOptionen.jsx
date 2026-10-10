import { useEffect, useState } from 'react'
import Icon from '../Icon.jsx'
import { SEITEN } from './VisitenkartenBogen.jsx'
import { CARDS_PER_SHEET } from '../../lib/visitenkarte.js'
import { MAX_KARTEN, MIN_KARTEN, clampKarten, sheetCountFor } from '../../lib/einladungskarte.js'
import { t } from '../../lib/i18n/index.js'

// Drucken (Phase V5, Feedback-Runde: für jede Kombination gleich): wie viele Karten (1-50 - der letzte Bogen darf
// angebrochen sein), welche Seiten und der Druck-Knopf (onPrint - mit Code-Rückseite holt er erst die Codes, dann druckt
// der Browser die Druckfassung). printable: wie viele Karten dieser Druck wirklich bekommt (ohne Code keine Karte mit
// Code-Rückseite; 0 = Knopf aus). addressNote: der Hinweis, solange die Plattform keine öffentliche Adresse hat - dann ist
// Drucken gesperrt. Dazu die Tipps für den beidseitigen Druck: die Rückseiten laufen je Reihe gespiegelt
// (lib/visitenkarte.js mirrorRows) - das passt zum Wenden über die lange Kante.

export const PRINT_HINT = 'Rückseiten: Duplex über die lange Kante – bei manuellem Druck das Blatt seitlich umdrehen.'
const SEITEN_OPTIONS = [
  { value: SEITEN.beide, label: 'Beide Seiten' },
  { value: SEITEN.vorne, label: 'Nur vorne' },
  { value: SEITEN.hinten, label: 'Nur hinten' }
]

function AnzahlField({ count, onCount, busy }) {
  const [text, setText] = useState(String(count))
  const sheets = sheetCountFor(count)

  // Wechselt die Zahl von außen (Knöpfe), zieht das Feld nach - ebenso beim Verlassen, damit kein ungültiger Rest bleibt.
  useEffect(() => setText(String(count)), [count])

  function handleText(event) {
    const next = event.target.value
    setText(next)
    if (/^\d+$/.test(next)) onCount(clampKarten(next))
  }

  return (
    <div className="field">
      <label className="vk-label" htmlFor="vk-anzahl">
        {t('Anzahl Karten')}
      </label>
      <div className="vk-anzahl">
        <button
          type="button"
          className="btn btn-ghost vk-anzahl-step"
          aria-label={t('Eine Karte weniger')}
          onClick={() => onCount(clampKarten(count - 1))}
          disabled={busy || count <= MIN_KARTEN}
        >
          −
        </button>
        <input
          id="vk-anzahl"
          type="number"
          inputMode="numeric"
          min={MIN_KARTEN}
          max={MAX_KARTEN}
          value={text}
          onChange={handleText}
          onBlur={() => setText(String(count))}
          disabled={busy}
          aria-describedby="vk-anzahl-hint"
        />
        <button
          type="button"
          className="btn btn-ghost vk-anzahl-step"
          aria-label={t('Eine Karte mehr')}
          onClick={() => onCount(clampKarten(count + 1))}
          disabled={busy || count >= MAX_KARTEN}
        >
          +
        </button>
      </div>
      <p id="vk-anzahl-hint" className="field-hint">
        {t(sheets === 1 ? '{min} bis {max} · {n} A4-Bogen mit je bis zu {per} Karten (2 × 5) und Schnittmarken' : '{min} bis {max} · {n} A4-Bögen mit je bis zu {per} Karten (2 × 5) und Schnittmarken', {
          min: MIN_KARTEN,
          max: MAX_KARTEN,
          n: sheets,
          per: CARDS_PER_SHEET
        })}
      </p>
    </div>
  )
}

function SeitenField({ seiten, onSeiten, busy }) {
  return (
    <div className="field">
      <span className="vk-label" id="vk-seiten-label">
        {t('Seiten')}
      </span>
      <div className="segmented vk-segmented" role="group" aria-labelledby="vk-seiten-label">
        {SEITEN_OPTIONS.map((option) => (
          <button key={option.value} type="button" aria-pressed={seiten === option.value} onClick={() => onSeiten(option.value)} disabled={busy}>
            {t(option.label)}
          </button>
        ))}
      </div>
      <p className="field-hint">{t('Ohne Duplex: erst „Nur vorne“, den Stapel seitlich umdrehen, dann „Nur hinten“.')}</p>
    </div>
  )
}

// Zum Aufklappen, damit die Seite kurz bleibt; der wichtigste Satz (PRINT_HINT) steht schon in der Zusammenfassung.
function DruckHints() {
  return (
    <details className="vk-druck-tipps">
      <summary>
        <strong>{t(PRINT_HINT)}</strong> <span className="vk-druck-tipps-mehr">{t('Mehr Tipps')}</span>
      </summary>
      <ul className="vk-druck-hints">
        <li>
          {t('Bei „Beide Seiten“ folgt jedem Vorderseiten-Bogen sein Rückseiten-Bogen; die Rückseiten laufen gespiegelt, damit jede hinter ihrer Karte liegt.')}
        </li>
        <li>{t('Im Druckdialog „Tatsächliche Größe“ bzw. 100 % wählen – sonst stimmen Kartenmaß und Schnittmarken nicht.')}</li>
        <li>{t('Festes Papier (ab 250 g/m²) wirkt wie eine echte Visitenkarte. Geschnitten wird an den Marken.')}</li>
      </ul>
    </details>
  )
}

function printLabel({ busy, printable, withCodes }) {
  if (busy) return t('Hole Codes …')
  if (printable === 0) return t('Drucken')
  const karten = printable === 1 ? t('{n} Karte', { n: printable }) : t('{n} Karten', { n: printable })
  return withCodes ? t('Drucken – {cards} mit Code', { cards: karten }) : t('Drucken – {cards}', { cards: karten })
}

export default function KartenDruckOptionen({ count, onCount, seiten, onSeiten, onPrint, busy, printable, withCodes, addressNote = null }) {
  return (
    <section className="vk-panel" aria-labelledby="vk-druck-title">
      <h2 id="vk-druck-title" className="vk-panel-title">
        {t('Drucken')}
      </h2>
      <AnzahlField count={count} onCount={onCount} busy={busy} />
      <SeitenField seiten={seiten} onSeiten={onSeiten} busy={busy} />
      {addressNote}
      <button
        type="button"
        className="btn btn-primary btn-lg vk-print-button"
        onClick={onPrint}
        disabled={busy || printable === 0 || Boolean(addressNote)}
      >
        <Icon name="printer" /> {printLabel({ busy, printable, withCodes })}
      </button>
      <DruckHints />
    </section>
  )
}

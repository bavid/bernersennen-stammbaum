import { useEffect, useState } from 'react'
import Icon from '../Icon.jsx'
import { DruckHints, SeitenField } from './VisitenkarteDruckOptionen.jsx'
import { CARDS_PER_SHEET } from '../../lib/visitenkarte.js'
import { MAX_KARTEN, MIN_KARTEN, clampKarten, sheetCountFor } from '../../lib/einladungskarte.js'

// Drucken der Einladungskarten: wie viele Karten (1-50 statt ganzer Bögen - der letzte Bogen darf angebrochen sein),
// welche Seiten und der Druck-Knopf (onPrint holt erst die Codes, dann druckt der Browser die Druckfassung). printable:
// wie viele Karten dieser Druck wirklich bekommt (ohne Code keine Karte; 0 = Knopf aus). Die Hinweise zum beidseitigen
// Druck teilt das Panel mit den Visitenkarten (VisitenkarteDruckOptionen.jsx).

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
        Anzahl Karten
      </label>
      <div className="vk-anzahl">
        <button
          type="button"
          className="btn btn-ghost vk-anzahl-step"
          aria-label="Eine Karte weniger"
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
          aria-label="Eine Karte mehr"
          onClick={() => onCount(clampKarten(count + 1))}
          disabled={busy || count >= MAX_KARTEN}
        >
          +
        </button>
      </div>
      <p id="vk-anzahl-hint" className="field-hint">
        {MIN_KARTEN} bis {MAX_KARTEN} · {sheets} A4-{sheets === 1 ? 'Bogen' : 'Bögen'} mit je bis zu {CARDS_PER_SHEET} Karten (2 × 5) und
        Schnittmarken
      </p>
    </div>
  )
}

function printLabel(busy, printable) {
  if (busy) return 'Hole Codes …'
  if (printable === 0) return 'Drucken'
  return `Drucken – ${printable} ${printable === 1 ? 'Einladungskarte' : 'Einladungskarten'}`
}

// addressNote: der Hinweis, solange die Plattform keine öffentliche Adresse hat - dann ist Drucken gesperrt.
export default function EinladungDruckOptionen({ count, onCount, seiten, onSeiten, onPrint, busy, printable, addressNote = null }) {
  return (
    <section className="vk-panel" aria-labelledby="vk-druck-title">
      <h2 id="vk-druck-title" className="vk-panel-title">
        Drucken
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
        <Icon name="printer" /> {printLabel(busy, printable)}
      </button>
      <DruckHints />
    </section>
  )
}

import Icon from './Icon.jsx'
import { MAX_ZEITRAEUME, zeitraeumeErrorRow } from '../lib/zeitraeume.js'

const HINT_ID = 'post-zeitraeume-hint'
const ERROR_ID = 'post-zeitraeume-error'

// Termine einer Anzeige im Beitrags-Formular (Phase V4a, PartnerPostForm): bis zu zwölf Zeilen mit "Am / ab" und optional
// "bis" - ein einzelner Tag oder ein Zeitraum. rows: [{ von, bis }] als Formularwerte (Strings), onChange(rows) mit der
// neuen Liste. error: die Meldung zum Feld (vom Client oder Server). Die Felder tragen eigene Labels je Zeile.
export default function PostZeitraeumeField({ rows, error, onChange }) {
  const describedBy = [HINT_ID, error && ERROR_ID].filter(Boolean).join(' ')
  // Nur die gemeinte Zeile ist ungültig (der Fokus springt dorthin) - ohne Zeilenangabe die erste.
  const errorRow = error ? Math.max(zeitraeumeErrorRow(rows, error), 0) : -1

  function updateRow(index, patch) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  return (
    <fieldset className="field span-2 post-zeitraeume" aria-describedby={describedBy}>
      <legend className="field-label">Termine (optional)</legend>
      <p className="field-hint" id={HINT_ID}>
        Für Aktionen an mehreren Tagen, z. B. am 1.2., 1.3. und 5.–10.5. Auf der Anzeige stehen nur die kommenden.
      </p>
      {rows.length > 0 && (
        <ol className="post-zeitraeume-list">
          {rows.map((row, index) => (
            <li key={index} className="post-zeitraeume-row">
              <label className="post-zeitraeume-input">
                <span>{`Termin ${index + 1}: am bzw. ab`}</span>
                <input type="date" value={row.von} aria-invalid={index === errorRow ? true : undefined} onChange={(e) => updateRow(index, { von: e.target.value })} />
              </label>
              <label className="post-zeitraeume-input">
                <span>bis (optional)</span>
                <input type="date" value={row.bis} min={row.von || undefined} onChange={(e) => updateRow(index, { bis: e.target.value })} />
              </label>
              <button
                type="button"
                className="icon-btn post-zeitraeume-remove"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                aria-label={`Termin ${index + 1} entfernen`}
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="btn btn-ghost post-zeitraeume-add"
        onClick={() => onChange([...rows, { von: '', bis: '' }])}
        disabled={rows.length >= MAX_ZEITRAEUME}
      >
        <Icon name="plus" /> Termin hinzufügen
      </button>
      {error && (
        <p className="field-error" id={ERROR_ID} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}

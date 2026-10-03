import { fieldProps } from './AdminField.jsx'

const IDS = {
  startDate: 'admin-hinweis-start-datum',
  startTime: 'admin-hinweis-start-zeit',
  endeDate: 'admin-hinweis-ende-datum',
  endeTime: 'admin-hinweis-ende-zeit'
}

// Ein Zeitpunkt als Datum + Uhrzeit (Berliner Zeit). Der Fehler steht unter beiden Feldern, markiert wird das Datum.
function Zeitpunkt({ legend, dateKey, timeKey, form, error, hint, update }) {
  const errorId = `${IDS[dateKey]}-error`
  const hintId = `${IDS[dateKey]}-hint`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined
  return (
    <fieldset className="admin-hinweis-zeitpunkt">
      <legend className="field-label">{legend}</legend>
      <div className="admin-hinweis-zeitpunkt-row">
        <label className="visually-hidden" htmlFor={IDS[dateKey]}>
          {legend}: Datum
        </label>
        <input
          {...fieldProps(IDS[dateKey], { error })}
          aria-describedby={describedBy}
          type="date"
          value={form[dateKey]}
          onChange={(e) => update({ [dateKey]: e.target.value })}
        />
        <label className="visually-hidden" htmlFor={IDS[timeKey]}>
          {legend}: Uhrzeit
        </label>
        <input
          id={IDS[timeKey]}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          type="time"
          value={form[timeKey]}
          onChange={(e) => update({ [timeKey]: e.target.value })}
        />
      </div>
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}

// Zeitraum eines Hinweises (AdminHinweisForm): Beginn Pflicht, Ende optional (leer = ohne Ende). Alle Zeiten sind
// deutsche Zeit (Europe/Berlin) - lib/hinweise.js rechnet sie für den Server in UTC um.
export default function AdminHinweisZeitraum({ form, fieldErrors, update }) {
  return (
    <div className="admin-hinweis-zeitraum-fields span-2">
      <Zeitpunkt legend="Sichtbar ab" dateKey="startDate" timeKey="startTime" form={form} error={fieldErrors.start} update={update} />
      <Zeitpunkt
        legend="Sichtbar bis (optional)"
        dateKey="endeDate"
        timeKey="endeTime"
        form={form}
        error={fieldErrors.ende}
        hint="Leer lassen für „ohne Ende“. Alle Zeiten in deutscher Zeit."
        update={update}
      />
    </div>
  )
}

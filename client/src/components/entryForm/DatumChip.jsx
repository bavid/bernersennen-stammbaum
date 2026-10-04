import { useEffect, useId, useRef, useState } from 'react'
import Icon from '../Icon.jsx'
import { formatDateLong, todayIso } from '../../lib/dates.js'

function chipLabel(value) {
  if (!value) return 'Datum wählen'
  if (value === todayIso()) return 'Heute'
  return formatDateLong(value)
}

// Datum einer Erinnerung als Chip („Heute“) - ein Tipp darauf zeigt das Datumsfeld. Die Chronik sortiert nach diesem Tag.
// invalid/errorId: Fehler des Formulars (z. B. kein Datum) - dann steht das Feld gleich offen.
export default function DatumChip({ value, onChange, invalid, errorId }) {
  const inputId = useId()
  const regionId = useId()
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const openedByUser = useRef(false)
  const showInput = open || invalid

  useEffect(() => {
    if (open && openedByUser.current) inputRef.current?.focus()
    openedByUser.current = false
  }, [open])

  return (
    <div className="datum-chip">
      <button
        type="button"
        className="entry-chip"
        aria-expanded={showInput}
        aria-controls={regionId}
        aria-label={`Datum: ${chipLabel(value)} – ändern`}
        onClick={() => {
          openedByUser.current = !open
          setOpen(!open)
        }}
      >
        <Icon name="calendar" />
        <span>{chipLabel(value)}</span>
        <Icon name="chevronDown" className="entry-chip-caret" />
      </button>
      <div id={regionId} className="datum-chip-field" hidden={!showInput}>
        <label className="field-label" htmlFor={inputId}>
          Datum
        </label>
        <input
          ref={inputRef}
          id={inputId}
          name="datum"
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
        />
        <span className="field-hint">Die Chronik sortiert nach diesem Tag.</span>
      </div>
    </div>
  )
}

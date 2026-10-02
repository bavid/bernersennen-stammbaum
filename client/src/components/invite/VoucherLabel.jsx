import { useState } from 'react'
import Icon from '../Icon.jsx'

export const MAX_LABEL_LENGTH = 60

// Eigene Notiz an einem Code (Phase V2b, z. B. „Tante Ilse“) - nur der Ersteller sieht und ändert sie. Inline: Text
// bzw. „Notiz hinzufügen“, ein Klick öffnet das Feld; Enter speichert, Escape bricht ab. onSave(label) liefert ein
// Promise (der Aufrufer meldet Fehler); readOnly zeigt nur an.
export default function VoucherLabel({ label, onSave, readOnly }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(label || '')
  const [saving, setSaving] = useState(false)

  function startEditing() {
    setValue(label || '')
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    try {
      await onSave(value.trim())
      setEditing(false)
    } catch {
      // Fehler meldet der Aufrufer (Toast) - das Feld bleibt offen, damit nichts verloren geht.
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      save()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(false)
    }
  }

  if (readOnly) return label ? <span className="voucher-label">{label}</span> : null

  if (!editing) {
    return (
      <button type="button" className={`voucher-label-edit${label ? '' : ' is-empty'}`} onClick={startEditing}>
        <Icon name="edit" />
        <span>{label || 'Notiz hinzufügen'}</span>
        {label && <span className="visually-hidden"> – Notiz ändern</span>}
      </button>
    )
  }

  return (
    <span className="voucher-label-form">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX_LABEL_LENGTH}
        placeholder="z. B. Tante Ilse"
        aria-label="Notiz zum Code (nur für dich sichtbar)"
        autoFocus
      />
      <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
        Speichern
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
        Abbrechen
      </button>
    </span>
  )
}

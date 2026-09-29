import { useId, useState } from 'react'
import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import { relativeTime } from '../lib/dates.js'
import { readSetting, writeSetting } from '../lib/storage.js'

const MAX_LENGTH = 1000

function CommentForm({ placeholder, onSubmit, onCancel }) {
  const id = useId()
  const [text, setText] = useState('')
  const [autorName, setAutorName] = useState(() => readSetting('autorName', ''))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      writeSetting('autorName', autorName.trim())
      await onSubmit({ autorName, text })
      setText('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="reply-form" onSubmit={handleSubmit}>
      {error && (
        <p className="reply-error" role="alert">
          {error}
        </p>
      )}
      <label className="visually-hidden" htmlFor={`${id}-text`}>
        {placeholder}
      </label>
      <textarea
        id={`${id}-text`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        maxLength={MAX_LENGTH}
        rows={2}
        required
        autoFocus
      />
      <div className="reply-form-row">
        <label className="visually-hidden" htmlFor={`${id}-name`}>
          Dein Name
        </label>
        <input
          id={`${id}-name`}
          value={autorName}
          onChange={(e) => setAutorName(e.target.value)}
          placeholder="Dein Name"
          maxLength={60}
          autoComplete="name"
          required
        />
        <button type="button" className="btn btn-ghost reply-btn" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary reply-btn" disabled={saving}>
          <Icon name="send" />
          Senden
        </button>
      </div>
    </form>
  )
}

// Gesprächsverlauf mit Namen – für Pinnwand-Zettel (Antworten) und Chronik-Einträge (Kommentare).
// onAdd bekommt { autorName, text } und muss den gespeicherten Beitrag liefern oder werfen.
// canDelete(item): ob der Löschen-Knopf für diesen Beitrag erscheint (Standard: immer, wie bisher) –
// Chronik-Kommentare auf geteilten Tieren blenden ihn für Beiträge anderer Bereiche aus.
export default function CommentThread({
  items,
  noun = 'Antwort',
  plural = 'Antworten',
  verb = 'Antworten',
  placeholder,
  onAdd,
  onDelete,
  canDelete = () => true
}) {
  const [writing, setWriting] = useState(false)
  const count = items.length

  return (
    <>
      {count > 0 && (
        <section className="thread" aria-label={`${count} ${count === 1 ? noun : plural}`}>
          <ol className="replies">
            {items.map((item) => (
              <li key={item.id} className="reply">
                <p className="reply-meta">
                  <strong>{item.autor_name}</strong>
                  {/* ehemalig (Phase R): der Haushalt der Autorin ist heute nicht mehr Mitglied der Familie */}
                  {item.ehemalig && <span className="reply-former">ehemaliges Mitglied</span>} · {relativeTime(item.created_at)}
                </p>
                <p className="reply-text">{item.text}</p>
                {canDelete(item) && (
                  <ConfirmButton
                    onConfirm={() => onDelete(item)}
                    label=""
                    confirmLabel="Löschen?"
                    ariaLabel={`${noun} von ${item.autor_name} löschen`}
                    className="reply-delete"
                  />
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {writing ? (
        <CommentForm placeholder={placeholder || `Deine ${noun} …`} onSubmit={onAdd} onCancel={() => setWriting(false)} />
      ) : (
        <button type="button" className="reply-open" onClick={() => setWriting(true)}>
          <Icon name="message" />
          {count > 0 ? `${verb} (${count})` : verb}
        </button>
      )}
    </>
  )
}

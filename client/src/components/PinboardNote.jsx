import { useId, useState } from 'react'
import { api } from '../api'
import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import { formatTermin, relativeTime } from '../lib/dates.js'
import { isPastTermin } from '../lib/notes.js'
import { readSetting, writeSetting } from '../lib/storage.js'

function ReplyForm({ note, onAdded, onCancel }) {
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
      onAdded(await api.createReply(note.id, { autorName, text }))
      setText('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="reply-form" onSubmit={handleSubmit}>
      {error && <p className="reply-error" role="alert">{error}</p>}
      <label className="visually-hidden" htmlFor={`${id}-text`}>
        Antwort
      </label>
      <textarea
        id={`${id}-text`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Deine Antwort …"
        maxLength={1000}
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

function Reply({ reply, onDelete }) {
  return (
    <li className="reply">
      <p className="reply-meta">
        <strong>{reply.autor_name}</strong> · {relativeTime(reply.created_at)}
      </p>
      <p className="reply-text">{reply.text}</p>
      <ConfirmButton
        onConfirm={() => onDelete(reply)}
        label=""
        confirmLabel="Löschen?"
        ariaLabel={`Antwort von ${reply.autor_name} löschen`}
        className="reply-delete"
      />
    </li>
  )
}

// Ein Zettel mit Gesprächsverlauf. order hält die sortierte Reihenfolge auch im Einspalten-Layout.
export default function PinboardNote({ note, order, onDelete, onReplyAdded, onReplyDeleted, onError }) {
  const [replying, setReplying] = useState(false)
  const past = isPastTermin(note)
  const replyCount = note.replies.length

  async function handleDeleteReply(reply) {
    try {
      await api.deleteReply(note.id, reply.id)
      onReplyDeleted(note.id, reply.id)
    } catch (err) {
      onError(err.message)
    }
  }

  return (
    <article className={`note note-tone-${note.id % 4} ${past ? 'is-past' : ''}`} style={{ order }}>
      <span className="note-pin" aria-hidden="true" />
      {note.termin_datum && (
        <p className="note-termin">
          <Icon name="calendar" />
          {formatTermin(note.termin_datum, note.termin_zeit)}
          {past && <span className="note-past-label">vorbei</span>}
        </p>
      )}
      <p className="note-text">{note.text}</p>
      <footer className="note-footer">
        <span>
          {note.autor_name} · {relativeTime(note.created_at)}
        </span>
        <ConfirmButton onConfirm={() => onDelete(note)} label="Abnehmen" confirmLabel="Wirklich?" />
      </footer>

      {replyCount > 0 && (
        <section className="note-thread" aria-label={`${replyCount} ${replyCount === 1 ? 'Antwort' : 'Antworten'}`}>
          <ol className="replies">
            {note.replies.map((reply) => (
              <Reply key={reply.id} reply={reply} onDelete={handleDeleteReply} />
            ))}
          </ol>
        </section>
      )}

      {replying ? (
        <ReplyForm
          note={note}
          onAdded={(reply) => onReplyAdded(note.id, reply)}
          onCancel={() => setReplying(false)}
        />
      ) : (
        <button type="button" className="reply-open" onClick={() => setReplying(true)}>
          <Icon name="message" />
          {replyCount > 0 ? `Antworten (${replyCount})` : 'Antworten'}
        </button>
      )}
    </article>
  )
}

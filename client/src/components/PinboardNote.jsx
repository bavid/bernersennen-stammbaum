import { api } from '../api'
import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import CommentThread from './CommentThread.jsx'
import { formatTermin, relativeTime } from '../lib/dates.js'
import { isPastTermin } from '../lib/notes.js'

// Ein Zettel mit Gesprächsverlauf. order hält die sortierte Reihenfolge auch im Einspalten-Layout.
export default function PinboardNote({ note, order, onDelete, onReplyAdded, onReplyDeleted, onError }) {
  const past = isPastTermin(note)

  async function handleAddReply(payload) {
    onReplyAdded(note.id, await api.createReply(note.id, payload))
  }

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

      <CommentThread
        items={note.replies}
        placeholder="Deine Antwort …"
        onAdd={handleAddReply}
        onDelete={handleDeleteReply}
      />
    </article>
  )
}

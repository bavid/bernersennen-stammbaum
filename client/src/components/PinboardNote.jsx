import { api } from '../api'
import Icon from './Icon.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import CommentThread from './CommentThread.jsx'
import { formatTermin, relativeTime } from '../lib/dates.js'
import { isPastTermin } from '../lib/notes.js'
import { t } from '../lib/i18n/index.js'

// Ein Zettel mit Gesprächsverlauf. order hält die sortierte Reihenfolge auch im Einspalten-Layout.
// canDelete (Phase R): darf der Zettel abgenommen werden (ab Mitglied); canDeleteReply(reply): darf diese
// Antwort gelöscht werden (in einer Familie: eigene oder ab Stellvertretung) - beides Standard "ja", wie bisher.
export default function PinboardNote({
  note,
  order,
  onDelete,
  onReplyAdded,
  onReplyDeleted,
  onError,
  canDelete = true,
  canDeleteReply = () => true
}) {
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
          {past && <span className="note-past-label">{t('vorbei')}</span>}
        </p>
      )}
      <p className="note-text">{note.text}</p>
      <footer className="note-footer">
        <span>
          {note.autor_name} · {relativeTime(note.created_at)}
        </span>
        {canDelete && <ConfirmButton onConfirm={() => onDelete(note)} label={t('Abnehmen')} confirmLabel={t('Wirklich?')} />}
      </footer>

      <CommentThread
        items={note.replies}
        placeholder={t('Deine Antwort …')}
        onAdd={handleAddReply}
        onDelete={handleDeleteReply}
        canDelete={canDeleteReply}
      />
    </article>
  )
}

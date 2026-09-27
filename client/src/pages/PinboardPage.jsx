import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import PinboardNote from '../components/PinboardNote.jsx'
import { useToast } from '../components/Toast.jsx'
import { formatTermin } from '../lib/dates.js'
import { sortNotes } from '../lib/notes.js'
import { readSetting, writeSetting } from '../lib/storage.js'

const EMPTY_NOTE = { text: '', terminDatum: '', terminZeit: '' }

// draft: vorbereiteter Zettel, z. B. "Wurftreffen" von der Würfe-Seite
function NoteComposer({ onCreated, draft }) {
  const [note, setNote] = useState(() => ({ ...EMPTY_NOTE, ...draft }))
  const [autorName, setAutorName] = useState(() => readSetting('autorName', ''))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const update = (patch) => setNote((current) => ({ ...current, ...patch }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      writeSetting('autorName', autorName.trim())
      const created = await api.createNote({ ...note, autorName })
      onCreated(created)
      setNote(EMPTY_NOTE)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card form-stack note-composer" onSubmit={handleSubmit}>
      <h2>Neuer Zettel</h2>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="field">
        <label className="field-label" htmlFor="note-text">
          Was möchtest du allen sagen?
        </label>
        <textarea
          id="note-text"
          value={note.text}
          onChange={(e) => update({ text: e.target.value })}
          placeholder="z. B. Wer hat Lust auf einen Spaziergang mit allen Geschwistern?"
          maxLength={2000}
          required
        />
      </div>
      <div className="field">
        <span className="field-label">Termin (optional)</span>
        <div className="note-termin-inputs">
          <input
            type="date"
            aria-label="Datum des Termins"
            value={note.terminDatum}
            onChange={(e) => update({ terminDatum: e.target.value, terminZeit: e.target.value ? note.terminZeit : '' })}
          />
          <input
            type="time"
            aria-label="Uhrzeit des Termins"
            value={note.terminZeit}
            onChange={(e) => update({ terminZeit: e.target.value })}
            disabled={!note.terminDatum}
          />
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="note-author">
          Dein Name
        </label>
        <input
          id="note-author"
          value={autorName}
          onChange={(e) => setAutorName(e.target.value)}
          maxLength={60}
          autoComplete="name"
          required
        />
      </div>
      <button className="btn btn-primary btn-lg" type="submit" disabled={saving}>
        <Icon name="pin" />
        {saving ? 'Pinne an …' : 'Anpinnen'}
      </button>
    </form>
  )
}

export default function PinboardPage() {
  const draft = useLocation().state?.draft
  const [notes, setNotes] = useState(null)
  const [error, setError] = useState(null)
  const toast = useToast()

  useEffect(() => {
    api
      .listNotes()
      .then(setNotes)
      .catch((err) => setError(err.message))
  }, [])

  const sorted = useMemo(() => (notes ? sortNotes(notes) : []), [notes])

  function handleCreated(note) {
    setNotes((current) => [note, ...current])
    toast(note.termin_datum ? `Termin angepinnt: ${formatTermin(note.termin_datum, note.termin_zeit)}` : 'Zettel angepinnt')
  }

  const updateNote = (noteId, change) =>
    setNotes((current) => current.map((note) => (note.id === noteId ? change(note) : note)))

  function handleReplyAdded(noteId, reply) {
    updateNote(noteId, (note) => ({ ...note, replies: [...note.replies, reply] }))
  }

  function handleReplyDeleted(noteId, replyId) {
    updateNote(noteId, (note) => ({ ...note, replies: note.replies.filter((r) => r.id !== replyId) }))
  }

  async function handleDelete(note) {
    try {
      await api.deleteNote(note.id)
      setNotes((current) => current.filter((n) => n.id !== note.id))
      toast('Zettel abgenommen')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">Pinnwand</span>
          <h1>Pinnwand</h1>
          <p className="page-lede">
            Treffen ausmachen, Neuigkeiten teilen, Grüße dalassen – alle im Rudel sehen es. Kommende Termine stehen immer
            ganz oben.
          </p>
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <div className="pinboard-layout">
        <NoteComposer onCreated={handleCreated} draft={draft} />
        <section aria-label="Angepinnte Zettel">
          {notes && notes.length === 0 && (
            <div className="empty-state">
              <Icon name="pin" />
              <h3>Noch nichts angepinnt</h3>
              <p>Mach den Anfang – zum Beispiel mit einem Treffen im Park.</p>
            </div>
          )}
          {sorted.length > 0 && (
            // Zwei feste Spalten statt CSS-columns: ein aufklappendes Antwortfeld verschiebt
            // so keine Zettel in die andere Spalte. Am Handy sorgt "order" für die Reihenfolge.
            <div className="board">
              {[0, 1].map((column) => (
                <div className="board-col" key={column}>
                  {sorted.map(
                    (note, index) =>
                      index % 2 === column && (
                        <PinboardNote
                          key={note.id}
                          note={note}
                          order={index}
                          onDelete={handleDelete}
                          onReplyAdded={handleReplyAdded}
                          onReplyDeleted={handleReplyDeleted}
                          onError={setError}
                        />
                      )
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

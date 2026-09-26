import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import ConfirmButton from '../components/ConfirmButton.jsx'
import { useToast } from '../components/Toast.jsx'
import { formatTermin, relativeTime } from '../lib/dates.js'
import { isPastTermin, sortNotes } from '../lib/notes.js'
import { readSetting, writeSetting } from '../lib/storage.js'

const EMPTY_NOTE = { text: '', terminDatum: '', terminZeit: '' }

function NoteComposer({ onCreated }) {
  const [note, setNote] = useState(EMPTY_NOTE)
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

function Note({ note, onDelete }) {
  const past = isPastTermin(note)
  return (
    <article className={`note note-tone-${note.id % 4} ${past ? 'is-past' : ''}`}>
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
    </article>
  )
}

export default function PinboardPage() {
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
        <NoteComposer onCreated={handleCreated} />
        <section aria-label="Angepinnte Zettel">
          {notes && notes.length === 0 && (
            <div className="empty-state">
              <Icon name="pin" />
              <h3>Noch nichts angepinnt</h3>
              <p>Mach den Anfang – zum Beispiel mit einem Treffen im Park.</p>
            </div>
          )}
          {sorted.length > 0 && (
            <div className="board">
              {sorted.map((note) => (
                <Note key={note.id} note={note} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

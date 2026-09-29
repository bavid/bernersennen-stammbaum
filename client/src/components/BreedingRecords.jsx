import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import Icon from './Icon.jsx'
import ParentPicker from './ParentPicker.jsx'
import PhotoPicker from './PhotoPicker.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import { formatDateLong, todayIso } from '../lib/dates.js'
import { shortName } from '../lib/timeline.js'
import { isEditable } from '../lib/areas.js'

const EMPTY_FORM = { mutterDogId: '', vater: { dogId: '', freitext: '' }, datum: todayIso(), wurfInfo: '', fotos: [] }

function BreedingForm({ ownDogs, allDogs, onCreated, onCancel }) {
  const { words } = useTheme()
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  // ownDogs (aus listDogs) enthält seit dem Teilen auch hierher geteilte, nicht bearbeitbare Tiere –
  // ein Deckakt lässt sich aber nur mit eigenen Hündinnen eintragen (der Server würde alles andere ablehnen).
  const mothers = ownDogs.filter((d) => d.geschlecht === 'huendin' && (d.tierart || 'hund') === 'hund' && isEditable(d))
  const update = (patch) => setForm((current) => ({ ...current, ...patch }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const created = await api.createBreedingEvent({
        mutterDogId: form.mutterDogId,
        vaterDogId: form.vater.dogId || null,
        vaterFreitext: form.vater.freitext || null,
        datum: form.datum,
        wurfInfo: form.wurfInfo,
        fotoUrls: form.fotos
      })
      onCreated(created)
      setForm({ ...EMPTY_FORM, mutterDogId: form.mutterDogId })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form-stack card breeding-form" onSubmit={handleSubmit}>
      <h3>Deckakt eintragen</h3>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="field">
        <label className="field-label" htmlFor="mutter">
          Hündin
        </label>
        <select
          id="mutter"
          value={form.mutterDogId}
          onChange={(e) => update({ mutterDogId: e.target.value ? Number(e.target.value) : '' })}
          required
        >
          <option value="">– Hündin {words.ofGroup} wählen –</option>
          {mothers.map((dog) => (
            <option key={dog.id} value={dog.id}>
              {dog.name}
            </option>
          ))}
        </select>
      </div>
      <ParentPicker label="Rüde" sex="ruede" dogs={allDogs} value={form.vater} onChange={(vater) => update({ vater })} />
      <div className="field">
        <label className="field-label" htmlFor="breeding-date">
          Datum des Deckakts <span className="muted">(auch geplant)</span>
        </label>
        <input id="breeding-date" type="date" value={form.datum} onChange={(e) => update({ datum: e.target.value })} required />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="wurf-info">
          Notizen
        </label>
        <textarea
          id="wurf-info"
          value={form.wurfInfo}
          onChange={(e) => update({ wurfInfo: e.target.value })}
          placeholder="Anzahl Welpen, Besonderheiten, Ultraschall …"
        />
      </div>
      <div className="field">
        <span className="field-label">Fotos</span>
        <PhotoPicker value={form.fotos} onChange={(fotos) => update({ fotos })} onBusyChange={setUploading} onError={setError} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button className="btn btn-primary" type="submit" disabled={saving || uploading || !form.mutterDogId}>
          {saving ? 'Speichere …' : 'Eintragen'}
        </button>
      </div>
    </form>
  )
}

export function BreedingEvent({ event, onDelete, onOpenPhoto }) {
  const father = event.vater_name || event.vater_freitext
  return (
    <li className="breeding-event">
      <time className="breeding-date" dateTime={event.datum}>
        Deckakt · {formatDateLong(event.datum)}
      </time>
      <div className="breeding-pair">
        <Link to={`/tier/${event.mutter_dog_id}`}>{shortName(event.mutter_name)}</Link>
        <Icon name="heart" />
        {event.vater_dog_id ? (
          <Link to={`/tier/${event.vater_dog_id}`}>{shortName(father)}</Link>
        ) : (
          <span>{father || 'unbekannter Rüde'}</span>
        )}
      </div>
      {event.wurf_info && <p className="breeding-info">{event.wurf_info}</p>}
      {event.foto_urls.length > 0 && (
        <div className="entry-photos count-3">
          {event.foto_urls.map((url) => (
            <button type="button" key={url} className="entry-photo" onClick={() => onOpenPhoto(url)} aria-label="Foto vergrößern">
              <img src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {onDelete && (
        <div className="breeding-actions">
          <ConfirmButton onConfirm={() => onDelete(event)} label="Löschen" />
        </div>
      )}
    </li>
  )
}

// Das bisherige Zuchtbuch als Abschnitt der Würfe-Seite: für die, die züchten – alle anderen sehen es zugeklappt.
// canWrite (Phase R): ohne Schreibrecht (Gast in einer Familie) kein "Deckakt eintragen"; Löschen hängt an onDelete.
export default function BreedingRecords({ events, ownDogs, allDogs, canWrite = true, onCreated, onDelete, onOpenPhoto }) {
  const [writing, setWriting] = useState(false)
  return (
    <section className="breeding-records" aria-labelledby="breeding-records-title">
      <div className="section-head">
        <h2 id="breeding-records-title" className="section-title">
          Zuchtbuch
        </h2>
        {canWrite && !writing && (
          <button type="button" className="btn btn-ghost" onClick={() => setWriting(true)}>
            <Icon name="plus" /> Deckakt eintragen
          </button>
        )}
      </div>
      <p className="muted">
        Für die, die züchten: Ein Deckakt erscheint oben als erwarteter Wurf und später bei seinen Welpen.
      </p>
      {writing && (
        <BreedingForm
          ownDogs={ownDogs}
          allDogs={allDogs}
          onCreated={(created) => {
            onCreated(created)
            setWriting(false)
          }}
          onCancel={() => setWriting(false)}
        />
      )}
      {events.length > 0 && (
        <details className="breeding-all">
          <summary>Alle Einträge ({events.length})</summary>
          <ol className="breeding-list">
            {events.map((event) => (
              <BreedingEvent key={event.id} event={event} onDelete={onDelete} onOpenPhoto={onOpenPhoto} />
            ))}
          </ol>
        </details>
      )}
    </section>
  )
}

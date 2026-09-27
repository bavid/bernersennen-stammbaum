import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import ParentPicker from '../components/ParentPicker.jsx'
import PhotoPicker from '../components/PhotoPicker.jsx'
import ConfirmButton from '../components/ConfirmButton.jsx'
import Lightbox from '../components/Lightbox.jsx'
import { useToast } from '../components/Toast.jsx'
import { formatDateLong, todayIso } from '../lib/dates.js'
import { shortName } from '../lib/timeline.js'

const EMPTY_FORM = { mutterDogId: '', vater: { dogId: '', freitext: '' }, datum: todayIso(), wurfInfo: '', fotos: [] }

function BreedingForm({ ownDogs, allDogs, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const mothers = ownDogs.filter((d) => d.geschlecht === 'huendin')
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
      <h2>Neuer Eintrag</h2>
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
          <option value="">– Hündin des Rudels wählen –</option>
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
          Datum des Deckakts
        </label>
        <input id="breeding-date" type="date" value={form.datum} onChange={(e) => update({ datum: e.target.value })} required />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="wurf-info">
          Wurf &amp; Notizen
        </label>
        <textarea
          id="wurf-info"
          value={form.wurfInfo}
          onChange={(e) => update({ wurfInfo: e.target.value })}
          placeholder="Anzahl Welpen, Geburtsdatum, Besonderheiten …"
        />
      </div>
      <div className="field">
        <span className="field-label">Fotos</span>
        <PhotoPicker value={form.fotos} onChange={(fotos) => update({ fotos })} onBusyChange={setUploading} onError={setError} />
      </div>
      <button className="btn btn-primary btn-lg" type="submit" disabled={saving || uploading || !form.mutterDogId}>
        {saving ? 'Speichere …' : 'Ins Zuchtbuch eintragen'}
      </button>
    </form>
  )
}

function BreedingEvent({ event, onDelete, onOpenPhoto }) {
  const father = event.vater_name || event.vater_freitext
  return (
    <li className="breeding-event">
      <time className="breeding-date" dateTime={event.datum}>
        {formatDateLong(event.datum)}
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
      <div className="breeding-actions">
        <ConfirmButton onConfirm={() => onDelete(event)} label="Löschen" />
      </div>
    </li>
  )
}

export default function BreedingPage() {
  const [ownDogs, setOwnDogs] = useState([])
  const [allDogs, setAllDogs] = useState([])
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)
  const [photo, setPhoto] = useState(null)
  const toast = useToast()

  useEffect(() => {
    Promise.all([api.listDogs(), api.listAllDogs(), api.listBreedingEvents()])
      .then(([own, all, breeding]) => {
        setOwnDogs(own)
        setAllDogs(all)
        setEvents(breeding)
      })
      .catch((err) => setError(err.message))
  }, [])

  function handleCreated(created) {
    setEvents((current) => [created, ...current].sort((a, b) => (a.datum < b.datum ? 1 : -1)))
    toast('Im Zuchtbuch eingetragen')
  }

  async function handleDelete(event) {
    try {
      await api.deleteBreedingEvent(event.id)
      setEvents((current) => current.filter((e) => e.id !== event.id))
      toast('Eintrag gelöscht')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">Zuchtbuch</span>
          <h1>Deckakte &amp; Würfe</h1>
          <p className="page-lede">
            Haltet fest, wann eine Hündin gedeckt wurde und was aus dem Wurf geworden ist. Die Einträge erscheinen auch in
            der Chronik beider Elterntiere.
          </p>
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <div className="breeding-layout">
        <BreedingForm ownDogs={ownDogs} allDogs={allDogs} onCreated={handleCreated} />

        <section aria-labelledby="breeding-list-title">
          <h2 id="breeding-list-title" className="section-title">
            Bisherige Einträge
          </h2>
          {events && events.length === 0 && (
            <p className="empty-state">Noch keine Deckakte erfasst.</p>
          )}
          {events && events.length > 0 && (
            <ol className="breeding-list">
              {events.map((event) => (
                <BreedingEvent key={event.id} event={event} onDelete={handleDelete} onOpenPhoto={setPhoto} />
              ))}
            </ol>
          )}
        </section>
      </div>

      <Lightbox src={photo} onClose={() => setPhoto(null)} />
    </div>
  )
}

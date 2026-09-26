import { useState } from 'react'
import ParentPicker from './ParentPicker.jsx'
import PhotoPicker from './PhotoPicker.jsx'
import ConfirmButton from './ConfirmButton.jsx'

function initialState(dog) {
  return {
    name: dog?.name || '',
    geschlecht: dog?.geschlecht || 'huendin',
    geburtsdatum: dog?.geburtsdatum || '',
    farbeMarkings: dog?.farbe_markings || '',
    beschreibung: dog?.beschreibung || '',
    fotos: dog?.foto_url ? [dog.foto_url] : [],
    mother: { dogId: dog?.mother_dog_id || '', freitext: dog?.mother_freitext || '' },
    father: { dogId: dog?.father_dog_id || '', freitext: dog?.father_freitext || '' }
  }
}

function toPayload(form) {
  return {
    name: form.name,
    geschlecht: form.geschlecht,
    geburtsdatum: form.geburtsdatum || null,
    farbeMarkings: form.farbeMarkings || null,
    beschreibung: form.beschreibung || null,
    fotoUrl: form.fotos[0] || null,
    motherDogId: form.mother.dogId || null,
    motherFreitext: form.mother.freitext || null,
    fatherDogId: form.father.dogId || null,
    fatherFreitext: form.father.freitext || null
  }
}

// Anlegen und Bearbeiten eines Hundes. onSubmit bekommt das API-Payload.
export default function DogForm({ dog, allDogs, ownFamilyId, onSubmit, onDelete, onCancel }) {
  const [form, setForm] = useState(() => initialState(dog))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const update = (patch) => setForm((current) => ({ ...current, ...patch }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSubmit(toPayload(form))
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    setError(null)
    setSaving(true)
    try {
      await onDelete()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      {error && (
        <div className="error-banner span-2" role="alert">
          {error}
        </div>
      )}

      <div className="field span-2 dog-form-photo">
        <span className="field-label">Porträt</span>
        <PhotoPicker
          value={form.fotos}
          onChange={(fotos) => update({ fotos })}
          multiple={false}
          label="Foto wählen"
          onBusyChange={setUploading}
          onError={setError}
        />
      </div>

      <div className="field span-2">
        <label className="field-label" htmlFor="dog-name">
          Name (mit Zwinger)
        </label>
        <input
          id="dog-name"
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="z. B. Aiko vom Sonnenhang"
          maxLength={80}
          required
          autoFocus={!dog}
        />
      </div>

      <div className="field">
        <span className="field-label">Geschlecht</span>
        <div className="segmented" role="group" aria-label="Geschlecht">
          <button type="button" aria-pressed={form.geschlecht === 'huendin'} onClick={() => update({ geschlecht: 'huendin' })}>
            Hündin
          </button>
          <button type="button" aria-pressed={form.geschlecht === 'ruede'} onClick={() => update({ geschlecht: 'ruede' })}>
            Rüde
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="dog-birth">
          Geburtsdatum
        </label>
        <input
          id="dog-birth"
          type="date"
          value={form.geburtsdatum}
          onChange={(e) => update({ geburtsdatum: e.target.value })}
        />
      </div>

      <div className="field span-2">
        <label className="field-label" htmlFor="dog-color">
          Farbe &amp; Abzeichen
        </label>
        <input
          id="dog-color"
          value={form.farbeMarkings}
          onChange={(e) => update({ farbeMarkings: e.target.value })}
          placeholder="z. B. dreifarbig, symmetrische Blesse"
          maxLength={200}
        />
      </div>

      <ParentPicker
        label="Mutter"
        sex="huendin"
        dogs={allDogs}
        value={form.mother}
        onChange={(mother) => update({ mother })}
        excludeId={dog?.id}
        ownFamilyId={ownFamilyId}
      />
      <ParentPicker
        label="Vater"
        sex="ruede"
        dogs={allDogs}
        value={form.father}
        onChange={(father) => update({ father })}
        excludeId={dog?.id}
        ownFamilyId={ownFamilyId}
      />

      <div className="field span-2">
        <label className="field-label" htmlFor="dog-description">
          Beschreibung
        </label>
        <textarea
          id="dog-description"
          value={form.beschreibung}
          onChange={(e) => update({ beschreibung: e.target.value })}
          placeholder="Wesen, Eigenheiten, Lieblingsplätze …"
          maxLength={5000}
        />
      </div>

      <div className="form-actions span-2">
        {onDelete && <ConfirmButton onConfirm={handleDelete} label="Hund löschen" disabled={saving} />}
        <span className="form-actions-spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
          {saving ? 'Speichere …' : dog ? 'Änderungen speichern' : 'Hund anlegen'}
        </button>
      </div>
    </form>
  )
}

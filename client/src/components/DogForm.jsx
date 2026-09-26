import { useState } from 'react'
import ParentPicker from './ParentPicker.jsx'
import PhotoPicker from './PhotoPicker.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import { dogLabel, sexLabel, speciesLabel, speciesNoun } from '../lib/timeline.js'

export const SPECIES = ['hund', 'katze', 'anderes']

// Beschriftungen, die sich nach der Tierart richten
export const SPECIES_FIELDS = {
  hund: { nameLabel: 'Name (mit Zwinger)', namePlaceholder: 'z. B. Aiko vom Sonnenhang', kindLabel: 'Rasse', kindPlaceholder: 'z. B. Berner Sennenhund oder Berner × Hovawart' },
  katze: { nameLabel: 'Name', namePlaceholder: 'z. B. Minka', kindLabel: 'Rasse', kindPlaceholder: 'z. B. Europäisch Kurzhaar' },
  anderes: { nameLabel: 'Name', namePlaceholder: 'z. B. Hoppel', kindLabel: 'Welches Tier?', kindPlaceholder: 'z. B. Kaninchen, Wellensittich, Pferd' }
}

const BREED_SUGGESTIONS = [
  'Berner Sennenhund',
  'Appenzeller Sennenhund',
  'Entlebucher Sennenhund',
  'Großer Schweizer Sennenhund',
  'Hovawart',
  'Berner × Appenzeller',
  'Berner × Hovawart',
  'Mischling'
]

function initialState(dog) {
  return {
    name: dog?.name_unbekannt ? '' : dog?.name || '',
    nameUnbekannt: Boolean(dog?.name_unbekannt),
    rasse: dog?.rasse || '',
    tierart: dog?.tierart || 'hund',
    housemateId: '',
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
    name: form.nameUnbekannt ? '' : form.name,
    nameUnbekannt: form.nameUnbekannt,
    rasse: form.rasse || null,
    tierart: form.tierart,
    housemateId: form.housemateId || null,
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

// Anlegen und Bearbeiten eines Tiers (meist Hund). onSubmit bekommt das API-Payload.
export default function DogForm({ dog, allDogs, ownFamilyId, onSubmit, onDelete, onCancel }) {
  const [form, setForm] = useState(() => initialState(dog))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const update = (patch) => setForm((current) => ({ ...current, ...patch }))
  const fields = SPECIES_FIELDS[form.tierart] || SPECIES_FIELDS.hund
  const noun = speciesNoun(form.tierart)

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
        <span className="field-label">Tierart</span>
        <div className="segmented" role="group" aria-label="Tierart">
          {SPECIES.map((tierart) => (
            <button
              type="button"
              key={tierart}
              aria-pressed={form.tierart === tierart}
              onClick={() =>
                update({
                  tierart,
                  // Eltern anderer Tierart passen nicht mehr
                  ...(tierart !== form.tierart && {
                    mother: { dogId: '', freitext: form.mother.freitext },
                    father: { dogId: '', freitext: form.father.freitext }
                  })
                })
              }
            >
              {speciesLabel(tierart)}
            </button>
          ))}
        </div>
      </div>

      <div className="field span-2">
        <div className="field-row">
          <label className="field-label" htmlFor="dog-name">
            {fields.nameLabel}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.nameUnbekannt}
              onChange={(e) => update({ nameUnbekannt: e.target.checked })}
            />
            Name unbekannt
          </label>
        </div>
        <input
          id="dog-name"
          value={form.nameUnbekannt ? '' : form.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder={form.nameUnbekannt ? 'Wird als „Unbekannt“ geführt' : fields.namePlaceholder}
          maxLength={80}
          required={!form.nameUnbekannt}
          disabled={form.nameUnbekannt}
          autoFocus={!dog}
        />
      </div>

      <div className="field span-2">
        <label className="field-label" htmlFor="dog-breed">
          {fields.kindLabel}
        </label>
        <input
          id="dog-breed"
          list={form.tierart === 'hund' ? 'breed-suggestions' : undefined}
          value={form.rasse}
          onChange={(e) => update({ rasse: e.target.value })}
          placeholder={fields.kindPlaceholder}
          maxLength={120}
        />
        <datalist id="breed-suggestions">
          {BREED_SUGGESTIONS.map((breed) => (
            <option key={breed} value={breed} />
          ))}
        </datalist>
      </div>

      <div className="field">
        <span className="field-label">Geschlecht</span>
        <div className="segmented" role="group" aria-label="Geschlecht">
          <button type="button" aria-pressed={form.geschlecht === 'huendin'} onClick={() => update({ geschlecht: 'huendin' })}>
            {sexLabel('huendin', form.tierart)}
          </button>
          <button type="button" aria-pressed={form.geschlecht === 'ruede'} onClick={() => update({ geschlecht: 'ruede' })}>
            {sexLabel('ruede', form.tierart)}
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

      {!dog && (
        <div className="field span-2">
          <label className="field-label" htmlFor="dog-housemate">
            Lebt zusammen mit <span className="muted">(optional, z. B. Adoptiv-Geschwister)</span>
          </label>
          <select id="dog-housemate" value={form.housemateId} onChange={(e) => update({ housemateId: e.target.value ? Number(e.target.value) : '' })}>
            <option value="">– niemandem –</option>
            {allDogs.map((other) => (
              <option key={other.id} value={other.id}>
                {dogLabel(other)}
              </option>
            ))}
          </select>
          <span className="field-hint">Ohne Verwandtschaft – im Stammbaum erscheint eine eigene Linie „lebt zusammen“.</span>
        </div>
      )}

      <ParentPicker
        label="Mutter"
        sex="huendin"
        tierart={form.tierart}
        dogs={allDogs}
        value={form.mother}
        onChange={(mother) => update({ mother })}
        excludeId={dog?.id}
        ownFamilyId={ownFamilyId}
      />
      <ParentPicker
        label="Vater"
        sex="ruede"
        tierart={form.tierart}
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
        {onDelete && <ConfirmButton onConfirm={handleDelete} label={`${noun} löschen`} disabled={saving} />}
        <span className="form-actions-spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
          {saving ? 'Speichere …' : dog ? 'Änderungen speichern' : `${noun} anlegen`}
        </button>
      </div>
    </form>
  )
}

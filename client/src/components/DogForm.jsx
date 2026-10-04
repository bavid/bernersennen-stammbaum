import { useState } from 'react'
import ParentPicker from './ParentPicker.jsx'
import PhotoPicker from './PhotoPicker.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import Icon from './Icon.jsx'
import { SEX_CHOICES, UNKNOWN_SEX, speciesLabel, speciesNoun } from '../lib/timeline.js'

const HERKUNFT_OPTIONS = [
  { value: '', label: '–' },
  { value: 'tierheim', label: 'Tierheim/Tierschutz' },
  { value: 'privat', label: 'von privat' },
  { value: 'zuechter', label: 'vom Züchter' },
  { value: 'nachwuchs', label: 'eigener Nachwuchs' },
  { value: 'fundtier', label: 'Fundtier' },
  { value: 'anderes', label: 'anderes' }
]

const ABSCHIED_OPTIONS = [
  { value: '', label: '– bitte wählen –' },
  { value: 'verstorben', label: 'verstorben' },
  { value: 'abgegeben', label: 'abgegeben' },
  { value: 'umgezogen', label: 'umgezogen' },
  { value: 'anderes', label: 'anderes' }
]

// Ist irgendetwas aus "Bei uns" bereits gesetzt? Dann startet der Abschnitt aufgeklappt statt eingeklappt.
function hasCompanionInfo(dog) {
  return Boolean(dog.bei_uns_seit || dog.bei_uns_bis || dog.herkunft_art || dog.herkunft_text)
}

const SPECIES = ['hund', 'katze', 'anderes']

// Beschriftungen, die sich nach der Tierart richten
const SPECIES_FIELDS = {
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

// Die Werte des Tiers als Formular.
function initialState(dog) {
  return {
    name: dog.name_unbekannt ? '' : dog.name || '',
    nameUnbekannt: Boolean(dog.name_unbekannt),
    rasse: dog.rasse || '',
    tierart: dog.tierart || 'hund',
    geschlecht: dog.geschlecht || UNKNOWN_SEX,
    geburtsdatum: dog.geburtsdatum || '',
    farbeMarkings: dog.farbe_markings || '',
    beschreibung: dog.beschreibung || '',
    fotos: dog.foto_url ? [dog.foto_url] : [],
    mother: { dogId: dog.mother_dog_id || '', freitext: dog.mother_freitext || '' },
    father: { dogId: dog.father_dog_id || '', freitext: dog.father_freitext || '' },
    beiUnsSeit: dog.bei_uns_seit || '',
    herkunftArt: dog.herkunft_art || '',
    herkunftText: dog.herkunft_text || '',
    nichtMehrBeiUns: Boolean(dog.bei_uns_bis),
    beiUnsBis: dog.bei_uns_bis || '',
    abschiedGrund: dog.abschied_grund || ''
  }
}

function toPayload(form) {
  return {
    name: form.nameUnbekannt ? '' : form.name,
    nameUnbekannt: form.nameUnbekannt,
    rasse: form.rasse || null,
    tierart: form.tierart,
    geschlecht: form.geschlecht,
    geburtsdatum: form.geburtsdatum || null,
    farbeMarkings: form.farbeMarkings || null,
    beschreibung: form.beschreibung || null,
    fotoUrl: form.fotos[0] || null,
    motherDogId: form.mother.dogId || null,
    motherFreitext: form.mother.freitext || null,
    fatherDogId: form.father.dogId || null,
    fatherFreitext: form.father.freitext || null,
    beiUnsSeit: form.beiUnsSeit || null,
    herkunftArt: form.herkunftArt || null,
    herkunftText: form.herkunftText || null,
    // Unchecking "nicht mehr bei uns" räumt Abschiedsdatum und -grund wieder ab
    beiUnsBis: form.nichtMehrBeiUns ? form.beiUnsBis || null : null,
    abschiedGrund: form.nichtMehrBeiUns ? form.abschiedGrund || null : null
  }
}

// Ein Tier bearbeiten (Tierseite, „Bearbeiten“) - angelegt wird ein Tier mit „Neues Tier“ (QuickAnimalForm). onSubmit
// bekommt das API-Payload für PUT /api/dogs/:id.
export default function DogForm({ dog, allDogs, ownFamilyId, onSubmit, onDelete, onCancel }) {
  const [form, setForm] = useState(() => initialState(dog))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [companionOpen, setCompanionOpen] = useState(() => hasCompanionInfo(dog))

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
        <div className="segmented sex-choice" role="group" aria-label="Geschlecht">
          {SEX_CHOICES.map((choice) => (
            <button key={choice.value} type="button" aria-pressed={form.geschlecht === choice.value} onClick={() => update({ geschlecht: choice.value })}>
              {choice.label}
            </button>
          ))}
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
        tierart={form.tierart}
        dogs={allDogs}
        value={form.mother}
        onChange={(mother) => update({ mother })}
        excludeId={dog.id}
        ownFamilyId={ownFamilyId}
      />
      <ParentPicker
        label="Vater"
        sex="ruede"
        tierart={form.tierart}
        dogs={allDogs}
        value={form.father}
        onChange={(father) => update({ father })}
        excludeId={dog.id}
        ownFamilyId={ownFamilyId}
      />

      <fieldset className="field span-2 companion-fieldset">
        <legend className="field-label">Bei uns</legend>
        {companionOpen ? (
          <div className="companion-fields">
            <div className="field">
              <label className="field-label" htmlFor="dog-bei-uns-seit">
                Einzug
              </label>
              <input
                id="dog-bei-uns-seit"
                type="date"
                value={form.beiUnsSeit}
                onChange={(e) => update({ beiUnsSeit: e.target.value })}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="dog-herkunft-art">
                Herkunft
              </label>
              <select
                id="dog-herkunft-art"
                value={form.herkunftArt}
                onChange={(e) => update({ herkunftArt: e.target.value })}
              >
                {HERKUNFT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field span-2">
              <label className="field-label" htmlFor="dog-herkunft-text">
                Woher genau <span className="muted">(optional)</span>
              </label>
              <input
                id="dog-herkunft-text"
                value={form.herkunftText}
                onChange={(e) => update({ herkunftText: e.target.value })}
                placeholder="z. B. Tierheim Sonnenhang"
                maxLength={120}
              />
            </div>

            <div className="field span-2">
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.nichtMehrBeiUns}
                  onChange={(e) => {
                    const nichtMehrBeiUns = e.target.checked
                    update({
                      nichtMehrBeiUns,
                      ...(!nichtMehrBeiUns && { beiUnsBis: '', abschiedGrund: '' })
                    })
                  }}
                />
                Nicht mehr bei uns
              </label>
            </div>

            {form.nichtMehrBeiUns && (
              <>
                <div className="field">
                  <label className="field-label" htmlFor="dog-bei-uns-bis">
                    Abschied
                  </label>
                  <input
                    id="dog-bei-uns-bis"
                    type="date"
                    value={form.beiUnsBis}
                    onChange={(e) => update({ beiUnsBis: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="dog-abschied-grund">
                    Grund
                  </label>
                  <select
                    id="dog-abschied-grund"
                    value={form.abschiedGrund}
                    onChange={(e) => update({ abschiedGrund: e.target.value })}
                  >
                    {ABSCHIED_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        ) : (
          <button type="button" className="disclosure-btn" onClick={() => setCompanionOpen(true)} aria-expanded="false">
            <Icon name="chevronDown" />
            Einzug, Herkunft, Abschied
          </button>
        )}
      </fieldset>

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
          {saving ? 'Speichere …' : 'Änderungen speichern'}
        </button>
      </div>
    </form>
  )
}

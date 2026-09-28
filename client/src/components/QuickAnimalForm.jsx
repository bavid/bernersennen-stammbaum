import { useState } from 'react'
import { api } from '../api'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { SPECIES, SPECIES_FIELDS } from './DogForm.jsx'
import Icon from './Icon.jsx'
import { dogLabel, livesWithLabel, sexLabel, speciesLabel } from '../lib/timeline.js'
import { isEditable } from '../lib/areas.js'

const ANDERES_KIND_LABEL = 'Welches Tier?'
const ANDERES_KIND_PLACEHOLDER = 'z. B. Kaninchen'

// Berner-Rudel legen praktisch immer Hunde an – das Rudel-Theme spart den Klick. Im tierneutralen
// Standard-Auftritt ist nichts vorbelegt, da hier jede Tierart gleich wahrscheinlich ist.
function initialTierart(themeId) {
  return themeId === 'berner' ? 'hund' : ''
}

function buildValues({ tierart, name, nameUnbekannt, rasse, geschlecht, beiUnsSeit, housemateId, livesWith }) {
  return {
    tierart,
    name: nameUnbekannt ? '' : name,
    nameUnbekannt,
    rasse: tierart === 'anderes' ? rasse : '',
    geschlecht,
    beiUnsSeit,
    housemateId: livesWith ? livesWith.id : housemateId || ''
  }
}

// Erster Schritt von "Tier hinzufügen": Tierart, Name, Geschlecht, optional "lebt mit" + Einzug – für
// jede Tierart, nicht nur Hunde. livesWith fest gesetzt (aus dem Stammbaum oder der Tierseite) macht
// "lebt mit" unveränderlich; sonst lässt sich ein vorhandenes eigenes Tier aus allDogs wählen.
// "Mehr Angaben …" reicht die bisherigen Werte an onMore weiter (z. B. um DogForm damit vorzufüllen) –
// ohne onMore-Prop bleibt der Knopf weg (z. B. auf der Tierseite, die kein volles Formular anbietet).
export default function QuickAnimalForm({ allDogs, livesWith = null, onCreated, onCancel, onMore }) {
  const { theme } = useTheme()
  const [tierart, setTierart] = useState(() => initialTierart(theme.id))
  const [tierartError, setTierartError] = useState(false)
  const [name, setName] = useState('')
  const [nameUnbekannt, setNameUnbekannt] = useState(false)
  const [rasse, setRasse] = useState('')
  const [geschlecht, setGeschlecht] = useState('huendin')
  const [housemateId, setHousemateId] = useState('')
  const [beiUnsSeit, setBeiUnsSeit] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const fields = SPECIES_FIELDS[tierart] || SPECIES_FIELDS.katze
  const editableDogs = allDogs.filter(isEditable)

  function selectTierart(next) {
    setTierart(next)
    setTierartError(false)
  }

  function handleMore() {
    if (!tierart) {
      setTierartError(true)
      return
    }
    onMore(buildValues({ tierart, name, nameUnbekannt, rasse, geschlecht, beiUnsSeit, housemateId, livesWith }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!tierart) {
      setTierartError(true)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const dog = await api.createDog({
        name: nameUnbekannt ? '' : name,
        nameUnbekannt,
        rasse: tierart === 'anderes' ? rasse || null : null,
        tierart,
        geschlecht,
        beiUnsSeit: beiUnsSeit || null,
        housemateId: (livesWith ? livesWith.id : housemateId) || null
      })
      onCreated(dog)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="form-grid quick-animal-form" onSubmit={handleSubmit}>
      {error && (
        <div className="error-banner span-2" role="alert">
          {error}
        </div>
      )}

      <div className="field span-2">
        <span className="field-label">Tierart</span>
        <div className="segmented" role="group" aria-label="Tierart">
          {SPECIES.map((option) => (
            <button type="button" key={option} aria-pressed={tierart === option} onClick={() => selectTierart(option)}>
              {speciesLabel(option)}
            </button>
          ))}
        </div>
        {tierartError && (
          <p className="field-error" role="alert">
            <Icon name="alert" /> Bitte wähle eine Tierart.
          </p>
        )}
      </div>

      {tierart === 'anderes' && (
        <div className="field span-2">
          <label className="field-label" htmlFor="quick-animal-kind">
            {ANDERES_KIND_LABEL}
          </label>
          <input
            id="quick-animal-kind"
            value={rasse}
            onChange={(e) => setRasse(e.target.value)}
            placeholder={ANDERES_KIND_PLACEHOLDER}
            maxLength={120}
          />
        </div>
      )}

      <div className="field span-2">
        <div className="field-row">
          <label className="field-label" htmlFor="quick-animal-name">
            {fields.nameLabel}
          </label>
          <label className="check">
            <input type="checkbox" checked={nameUnbekannt} onChange={(e) => setNameUnbekannt(e.target.checked)} />
            Name unbekannt
          </label>
        </div>
        <input
          id="quick-animal-name"
          value={nameUnbekannt ? '' : name}
          onChange={(e) => setName(e.target.value)}
          placeholder={nameUnbekannt ? 'Wird als „Unbekannt“ geführt' : fields.namePlaceholder}
          maxLength={80}
          required={!nameUnbekannt}
          disabled={nameUnbekannt}
          autoFocus
        />
      </div>

      <div className="field">
        <span className="field-label">Geschlecht</span>
        <div className="segmented" role="group" aria-label="Geschlecht">
          <button type="button" aria-pressed={geschlecht === 'huendin'} onClick={() => setGeschlecht('huendin')}>
            {sexLabel('huendin', tierart)}
          </button>
          <button type="button" aria-pressed={geschlecht === 'ruede'} onClick={() => setGeschlecht('ruede')}>
            {sexLabel('ruede', tierart)}
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="quick-animal-bei-uns-seit">
          Bei uns seit
        </label>
        <input
          id="quick-animal-bei-uns-seit"
          type="date"
          value={beiUnsSeit}
          onChange={(e) => setBeiUnsSeit(e.target.value)}
        />
      </div>

      <div className="field span-2">
        <span className="field-label">Lebt mit</span>
        {livesWith ? (
          <p className="quick-animal-fixed-housemate">{livesWithLabel([livesWith])}</p>
        ) : (
          <select
            aria-label="Lebt mit"
            value={housemateId}
            onChange={(e) => setHousemateId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">– niemandem –</option>
            {editableDogs.map((other) => (
              <option key={other.id} value={other.id}>
                {dogLabel(other)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="form-actions span-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        {onMore && (
          <button type="button" className="btn btn-ghost" onClick={handleMore}>
            Mehr Angaben …
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Speichere …' : 'Tier anlegen'}
        </button>
      </div>
    </form>
  )
}

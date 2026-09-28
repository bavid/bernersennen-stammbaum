import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import { SPECIES, SPECIES_FIELDS } from './DogForm.jsx'
import { animalKind, dogLabel, sexLabel, speciesLabel, speciesNoun } from '../lib/timeline.js'

const EMPTY_ANIMAL = { tierart: 'hund', name: '', geschlecht: 'ruede', rasse: '' }

// Schnellerfassung: neues Tier anlegen und direkt verbinden – oder ein vorhandenes wählen
function QuickAdd({ candidates, onAdd, onCreate, onClose }) {
  const [form, setForm] = useState(EMPTY_ANIMAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const fields = SPECIES_FIELDS[form.tierart]
  const update = (patch) => setForm((current) => ({ ...current, ...patch }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onCreate({ name: form.name, tierart: form.tierart, geschlecht: form.geschlecht, rasse: form.rasse || null })
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="quick-add" onSubmit={handleSubmit} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <p className="quick-add-title">Neues Tier, das hier mitwohnt</p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="segmented segmented-sm" role="group" aria-label="Tierart des Mitbewohners">
        {SPECIES.map((tierart) => (
          <button type="button" key={tierart} aria-pressed={form.tierart === tierart} onClick={() => update({ tierart })}>
            {speciesLabel(tierart)}
          </button>
        ))}
      </div>
      <div className="quick-add-fields">
        <div className="field">
          <label className="field-label" htmlFor="quick-name">
            Name
          </label>
          <input
            id="quick-name"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder={fields.namePlaceholder}
            maxLength={80}
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="quick-kind">
            {fields.kindLabel} <span className="muted">(optional)</span>
          </label>
          <input
            id="quick-kind"
            value={form.rasse}
            onChange={(e) => update({ rasse: e.target.value })}
            placeholder={fields.kindPlaceholder}
            maxLength={120}
          />
        </div>
      </div>
      <div className="segmented segmented-sm" role="group" aria-label="Geschlecht des Mitbewohners">
        {['ruede', 'huendin'].map((geschlecht) => (
          <button
            type="button"
            key={geschlecht}
            aria-pressed={form.geschlecht === geschlecht}
            onClick={() => update({ geschlecht })}
          >
            {sexLabel(geschlecht, form.tierart)}
          </button>
        ))}
      </div>
      <div className="quick-add-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Icon name="plus" />
          {saving ? 'Speichere …' : `${speciesNoun(form.tierart)} anlegen & verbinden`}
        </button>
      </div>
      {candidates.length > 0 && (
        <div className="quick-add-existing">
          <label htmlFor="housemate-existing">… oder schon in der Chronik:</label>
          <select
            id="housemate-existing"
            className="chip-select"
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return
              onAdd(Number(e.target.value))
              onClose()
            }}
          >
            <option value="">– Tier auswählen –</option>
            {candidates.map((other) => (
              <option key={other.id} value={other.id}>
                {dogLabel(other)}
              </option>
            ))}
          </select>
        </div>
      )}
    </form>
  )
}

// "Lebt zusammen mit": Mitbewohner ohne gemeinsame Abstammung und andere Tiere im selben Zuhause
export default function Housemates({ dog, allDogs, canEdit, onAdd, onCreate, onRemove }) {
  const [adding, setAdding] = useState(false)
  const linkedIds = new Set(dog.housemates.map((h) => h.id))
  const candidates = allDogs.filter((other) => other.id !== dog.id && !linkedIds.has(other.id))

  if (!dog.housemates.length && !canEdit) return null

  return (
    <div className="facts-wide housemates">
      <dt>Lebt zusammen mit</dt>
      <dd className="chip-list">
        {dog.housemates.map((mate) => {
          const kind = animalKind(mate)
          return (
            <span key={mate.id} className="chip chip-housemate">
              <Link to={`/tier/${mate.id}`} className="chip-link">
                <Avatar dog={mate} size={24} />
                {dogLabel(mate)}
                {kind && <span className="muted"> · {kind}</span>}
              </Link>
              {canEdit && (
                <button
                  type="button"
                  className="chip-remove"
                  onClick={() => onRemove(mate)}
                  aria-label={`Verbindung zu ${dogLabel(mate)} entfernen`}
                  title="Verbindung entfernen"
                >
                  <Icon name="close" />
                </button>
              )}
            </span>
          )
        })}
        {canEdit && !adding && (
          <button type="button" className="chip chip-add" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Mitbewohner
          </button>
        )}
        {canEdit && adding && (
          <QuickAdd candidates={candidates} onAdd={onAdd} onCreate={onCreate} onClose={() => setAdding(false)} />
        )}
      </dd>
    </div>
  )
}

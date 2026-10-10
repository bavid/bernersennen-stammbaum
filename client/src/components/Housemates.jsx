import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import Icon from './Icon.jsx'
import QuickAnimalForm from './QuickAnimalForm.jsx'
import { animalKind, dogLabel } from '../lib/timeline.js'
import { isEditable } from '../lib/areas.js'
import { t } from '../lib/i18n/index.js'

// "Lebt zusammen mit": Mitbewohner ohne gemeinsame Abstammung und andere Tiere im selben Zuhause.
// Neu anlegen läuft über QuickAnimalForm (dieselbe Maske wie im Stammbaum und auf "Tier hinzufügen") –
// livesWith fest auf dog, damit die Verbindung gleich beim Anlegen entsteht. Alternativ lässt sich ein
// bereits erfasstes Tier direkt verlinken (onAdd), ohne ein neues anzulegen.
export default function Housemates({ dog, allDogs, canEdit, onAdd, onCreated, onRemove }) {
  const [adding, setAdding] = useState(false)
  const linkedIds = new Set(dog.housemates.map((h) => h.id))
  // "lebt zusammen mit" darf nur zwischen eigenen Tieren gesetzt werden (der Server prüft das ebenso) –
  // ein hierher geteiltes Tier eines anderen Zuhauses taucht sonst fälschlich als Ziel auf.
  const candidates = allDogs.filter((other) => other.id !== dog.id && !linkedIds.has(other.id) && isEditable(other))

  if (!dog.housemates.length && !canEdit) return null

  return (
    <div className="facts-wide housemates">
      <dt>{t('Lebt zusammen mit')}</dt>
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
                  aria-label={t('Verbindung zu {name} entfernen', { name: dogLabel(mate) })}
                  title={t('Verbindung entfernen')}
                >
                  <Icon name="close" />
                </button>
              )}
            </span>
          )
        })}
        {canEdit && !adding && (
          <button type="button" className="chip chip-add" onClick={() => setAdding(true)}>
            <Icon name="plus" /> {t('Mitbewohner')}
          </button>
        )}
        {canEdit && adding && (
          <div className="quick-add">
            <p className="quick-add-title">{t('Neues Tier, das hier mitwohnt')}</p>
            <QuickAnimalForm
              allDogs={allDogs}
              livesWith={dog}
              onCreated={(created) => {
                setAdding(false)
                onCreated(created)
              }}
              onCancel={() => setAdding(false)}
            />
            {candidates.length > 0 && (
              <div className="quick-add-existing">
                <label htmlFor="housemate-existing">{t('… oder schon in der Chronik:')}</label>
                <select
                  id="housemate-existing"
                  className="chip-select"
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return
                    onAdd(Number(e.target.value))
                    setAdding(false)
                  }}
                >
                  <option value="">{t('– Tier auswählen –')}</option>
                  {candidates.map((other) => (
                    <option key={other.id} value={other.id}>
                      {dogLabel(other)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </dd>
    </div>
  )
}

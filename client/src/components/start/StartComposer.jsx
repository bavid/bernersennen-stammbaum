import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { api } from '../../api'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import Avatar from '../Avatar.jsx'
import Icon from '../Icon.jsx'
import TimelineEntryForm from '../TimelineEntryForm.jsx'
import { useToast } from '../Toast.jsx'
import { isEditable } from '../../lib/areas.js'
import { displayName } from '../../lib/timeline.js'
import { isOwnHome } from '../../lib/visits.js'

// Bis zu so vielen Tieren stehen sie als Knöpfe mit Bild da, darüber (z. B. eine große Familie) als Auswahlliste.
export const MAX_CHIPS = 6

// Tiere, für die man hier einen Beitrag schreiben kann: eigene, bearbeitbare, die noch bei euch leben - ohne
// Platzhalter für unbekannte Eltern. Alphabetisch.
export function composerAnimals(dogs = []) {
  return dogs
    .filter((dog) => isEditable(dog) && !dog.shared_from && !dog.bei_uns_bis && !dog.name_unbekannt)
    .sort((a, b) => displayName(a).localeCompare(displayName(b), 'de'))
}

// "Was erlebt euer Tier?" (Phase W, Start und Gruppenseite): ein Knopf „Erinnerung festhalten“ (B+ Familienalbum - die Tiere
// stehen auf Start schon als Kreise darüber, also nicht noch einmal), danach das Tier wählen, dann der bekannte
// Erinnerungs-Dialog (TimelineEntryForm). onCreated bekommt die neue Erinnerung samt Tier-Angaben, wie sie der Feed braucht.
// Ohne passendes Tier gibt es nichts zu erzählen - dann steht hier nichts.
export default function StartComposer({ family, dogs, onCreated }) {
  const { words } = useTheme()
  const toast = useToast()
  const titleId = useId()
  const selectId = useId()
  const animals = useMemo(() => composerAnimals(dogs), [dogs])
  const [dogId, setDogId] = useState(null)
  const [picking, setPicking] = useState(false)
  const chosen = animals.find((dog) => dog.id === dogId)
  const pickerRef = useRef(null)

  // Nach „Erinnerung festhalten“ steht der Fokus auf der Wahl des Tiers.
  useEffect(() => {
    if (picking && !chosen) pickerRef.current?.querySelector('button, select')?.focus()
  }, [picking, chosen])

  if (animals.length === 0) return null

  async function handleSubmit(payload) {
    const entry = await api.createTimelineEntry({ ...payload, dogId: chosen.id })
    setDogId(null)
    setPicking(false)
    toast(`${words.entry} zu ${displayName(chosen)} gespeichert`)
    onCreated?.({
      comment_count: 0,
      ...entry,
      dog_id: chosen.id,
      dog_name: chosen.name,
      dog_name_unbekannt: chosen.name_unbekannt,
      dog_rasse: chosen.rasse,
      dog_foto_url: chosen.foto_url
    })
  }

  return (
    <section className={`composer start-composer${chosen ? ' is-open' : ''}`} aria-labelledby={titleId}>
      <h2 id={titleId} className="start-composer-title">
        {chosen ? `${words.newEntry} zu ${displayName(chosen)}` : `Was erlebt euer ${words.animal}?`}
      </h2>
      {!picking && !chosen && (
        <button type="button" className="btn btn-primary start-composer-open" onClick={() => setPicking(true)}>
          <Icon name="camera" />
          {words.tellAction}
        </button>
      )}
      {(picking || chosen) && animals.length > MAX_CHIPS && (
        <div className="field start-composer-select" ref={pickerRef}>
          <label className="field-label" htmlFor={selectId}>
            {words.animal} wählen
          </label>
          <select id={selectId} value={dogId ?? ''} onChange={(event) => setDogId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Bitte wählen …</option>
            {animals.map((dog) => (
              <option key={dog.id} value={dog.id}>
                {displayName(dog)}
              </option>
            ))}
          </select>
        </div>
      )}
      {(picking || chosen) && animals.length <= MAX_CHIPS && (
        <div className="start-composer-animals" role="group" aria-label={`${words.animal} wählen`} ref={pickerRef}>
          {animals.map((dog) => (
            <button
              key={dog.id}
              type="button"
              className="start-composer-animal"
              aria-pressed={dog.id === dogId}
              onClick={() => setDogId((current) => (current === dog.id ? null : dog.id))}
            >
              <Avatar dog={dog} size={32} />
              <span>{displayName(dog)}</span>
            </button>
          ))}
        </div>
      )}
      {chosen && (
        <TimelineEntryForm
          key={chosen.id}
          canTag={isOwnHome(family)}
          isHousehold={family.art === 'zuhause'}
          isShelter={family.art === 'tierheim'}
          submitLabel={words.tellActionShort}
          onSubmit={handleSubmit}
          onCancel={() => {
            setDogId(null)
            setPicking(false)
          }}
        />
      )}
    </section>
  )
}

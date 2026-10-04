import { Link } from 'react-router-dom'
import Avatar from '../Avatar.jsx'
import Icon from '../Icon.jsx'
import { circleAnimals, isInMemory } from '../../lib/animalCircles.js'
import { displayName } from '../../lib/timeline.js'

// „Eure Tiere“ oben auf Start (B+ Familienalbum): je Tier ein Foto-Kreis mit Namen, der zur Tierseite führt; verstorbene
// Tiere mit sanft grauem Ring und „In Erinnerung“. Am Ende ein gestrichelter Kreis „Neu“ für ein neues Tier (nur, wer
// Tiere anlegen darf - onAdd öffnet den bekannten Dialog). Viele Tiere wischt man am Handy waagerecht durch.
export default function AnimalCircles({ dogs, canAdd, onAdd }) {
  const animals = circleAnimals(dogs || [])
  if (animals.length === 0 && !canAdd) return null
  return (
    <section className="animal-circles" aria-labelledby="animal-circles-title">
      <h2 id="animal-circles-title" className="visually-hidden">
        Eure Tiere
      </h2>
      <ul className="animal-circles-list" role="list">
        {animals.map((dog) => {
          const remembered = isInMemory(dog)
          return (
            <li key={dog.id}>
              <Link to={`/tier/${dog.id}`} className={`animal-circle${remembered ? ' is-memorial' : ''}`}>
                <Avatar dog={dog} size={58} className="animal-circle-photo" />
                <span className="animal-circle-name">{displayName(dog)}</span>
                {remembered && <span className="animal-circle-note">In Erinnerung</span>}
              </Link>
            </li>
          )
        })}
        {canAdd && (
          <li>
            <button type="button" className="animal-circle is-new" onClick={() => onAdd()} aria-label="Neues Tier anlegen">
              <span className="animal-circle-photo animal-circle-plus" aria-hidden="true">
                <Icon name="plus" />
              </span>
              <span className="animal-circle-name" aria-hidden="true">
                Neu
              </span>
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}

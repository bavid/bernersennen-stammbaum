import { Link } from 'react-router-dom'
import { api } from '../../api'
import { useTheme } from '../../themes/ThemeProvider.jsx'
import Avatar from '../Avatar.jsx'
import Icon from '../Icon.jsx'
import Housemates from '../Housemates.jsx'
import { useToast } from '../Toast.jsx'
import { displayName, dogLabel } from '../../lib/timeline.js'
import { addMatingPath, canAddMatingFor } from '../../lib/litters.js'
import { hasRelatives, treeRoute } from '../../lib/dogProfile.js'

// parent.id fehlt (null), wenn der Elternteil hier nicht sichtbar ist (fremder, nicht geteilter Bereich) – der Server
// liefert dann trotzdem den Namen zur Anzeige, aber ohne Ziel-Id. Ein Link auf `/tier/null` wäre kaputt, darum bleibt es in
// dem Fall bei einem einfachen Chip ohne Link.
export function ParentLink({ parent, freitext }) {
  if (parent?.id) {
    return (
      <Link to={`/tier/${parent.id}`} className="chip">
        <Avatar dog={parent} size={24} />
        {dogLabel(parent)}
      </Link>
    )
  }
  if (parent) {
    return (
      <span className="chip">
        <Avatar dog={parent} size={24} />
        {dogLabel(parent)}
      </span>
    )
  }
  return <span className={freitext ? '' : 'muted'}>{freitext || 'unbekannt'}</span>
}

// Geschwister bzw. Nachwuchs als Chips zur jeweiligen Tierseite - ohne Tiere keine leere Zeile.
function AnimalChips({ label, animals }) {
  if (!animals?.length) return null
  return (
    <div className="facts-wide">
      <dt>{label}</dt>
      <dd className="chip-list">
        {animals.map((animal) => (
          <Link key={animal.id} to={`/tier/${animal.id}`} className="chip">
            <Avatar dog={animal} size={24} />
            {dogLabel(animal)}
          </Link>
        ))}
      </dd>
    </div>
  )
}

// "Lebt zusammen mit" bearbeiten (nur canWrite): hinzufügen, neu anlegen (QuickAnimalForm im Housemates-Feld), entfernen.
function useHousemateActions(dog, setDog, reload) {
  const toast = useToast()
  return {
    async onAdd(otherId) {
      try {
        const housemates = await api.addHousemate(dog.id, otherId)
        setDog((current) => ({ ...current, housemates }))
        toast('Verbindung „lebt zusammen“ hinzugefügt')
      } catch (err) {
        toast(err.message)
      }
    },
    // QuickAnimalForm hat das Tier bereits angelegt und verlinkt (livesWith=dog) – hier nur neu laden
    async onCreated(created) {
      await reload()
      toast(`${displayName(created)} lebt jetzt mit ${displayName(dog)} zusammen`)
    },
    async onRemove(mate) {
      try {
        await api.removeHousemate(dog.id, mate.id)
        setDog((current) => ({ ...current, housemates: current.housemates.filter((h) => h.id !== mate.id) }))
        toast(`Verbindung zu ${dogLabel(mate)} entfernt`)
      } catch (err) {
        toast(err.message)
      }
    }
  }
}

// Reiter "Verwandte" der Tierseite (Phase W, Schritt 2): Mutter, Vater, Geschwister, Nachwuchs und
// "Lebt zusammen mit" (Mitbewohner ohne gemeinsame Abstammung), dazu die leisen Wege "Verpaarung eintragen" (erwachsene
// eigene Hündin) und "Im Stammbaum ansehen". Im Tierheim steht derselbe Block im Reiter "Infos" (embedded, ohne Wege).
export default function DogRelatives({ dog, setDog, family, allDogs, canWrite, reload, embedded = false }) {
  const { words } = useTheme()
  const housemates = useHousemateActions(dog, setDog, reload)
  const canMate = canWrite && canAddMatingFor(dog)
  const showTree = !embedded && hasRelatives(dog)

  return (
    <section className="dog-relatives" aria-labelledby={embedded ? undefined : 'dog-relatives-title'} aria-label={embedded ? 'Verwandte' : undefined}>
      {!embedded && (
        <h2 id="dog-relatives-title" className="visually-hidden">
          Verwandte von {displayName(dog)}
        </h2>
      )}
      <dl className="facts dog-relatives-facts">
        <div>
          <dt>Mutter</dt>
          <dd>
            <ParentLink parent={dog.mother} freitext={dog.mother_freitext} />
          </dd>
        </div>
        <div>
          <dt>Vater</dt>
          <dd>
            <ParentLink parent={dog.father} freitext={dog.father_freitext} />
          </dd>
        </div>
        <AnimalChips label="Geschwister" animals={dog.siblings} />
        <AnimalChips label="Nachwuchs" animals={dog.children} />
        <Housemates
          dog={dog}
          allDogs={allDogs}
          canEdit={canWrite}
          onAdd={housemates.onAdd}
          onCreated={housemates.onCreated}
          onRemove={housemates.onRemove}
        />
      </dl>
      {!embedded && (canMate || showTree) && (
        <p className="dog-relatives-links">
          {canMate && (
            <Link to={addMatingPath(dog.id)}>
              <Icon name="sprout" /> {words.addMating}
            </Link>
          )}
          {showTree && (
            <Link to={treeRoute(family)}>
              <Icon name="tree" /> Im Stammbaum ansehen
            </Link>
          )}
        </p>
      )}
    </section>
  )
}

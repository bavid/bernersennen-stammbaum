// Familienbande (Phase V3, Familienbande 2): ein Raster aller Tiere statt Generationen. Reine Logik für die Gruppen je
// Eigentümer (der eigene Bereich, die Zuhause der Mitglieder - der Filter über dem Raster) und die Frage, ob es schon
// einen Stammbaum gibt.
import { collectNodes, computeUnions } from './pedigree.js'

// Adresse der Familienbande: ?gruppe=eigen bzw. ?gruppe=<Bereichs-Id> wählt eine Gruppe, ohne Angabe stehen alle da.
export const GROUP_PARAM = 'gruppe'
export const OWN_GROUP_PARAM = 'eigen'

// Den Stammbaum gibt es erst, wenn eine Verpaarung eingetragen ist (events: GET /api/breeding) oder ein Tier einen
// bekannten Elternteil hat, der ebenfalls in den Daten steht - dann hätte der Baum mindestens zwei Generationen.
export function hasFamilyTree({ dogs = [], allDogs = [], events = [] } = {}) {
  if (events.length > 0) return true
  return computeUnions(collectNodes(dogs, allDogs)).length > 0
}

// 'tree' | 'families' | 'pending'. wantsTree: ?ansicht=stammbaum; loaded: Tiere und Verpaarungen sind geladen. Ein
// Stammbaum-Link wartet auf sie ('pending'), statt kurz die Familien aufblitzen zu lassen; gibt es danach keinen
// Stammbaum, zeigt er die Familien.
export function overviewMode({ wantsTree, treeAvailable, loaded }) {
  if (!wantsTree) return 'families'
  if (treeAvailable) return 'tree'
  return loaded ? 'families' : 'pending'
}

// Familienbande 2: unbekannte Eltern (Platzhalter "Unbekannt", als Mutter oder Vater eines Tiers eingetragen) gehören
// nur in den Stammbaum - im Raster stünden sie als namenlose Karten zwischen den Tieren. Ein Tier mit unbekanntem
// Namen, das niemandes Elternteil ist (z. B. ein Fundtier), bleibt.
export function familyAnimals(dogs = []) {
  const parentIds = new Set(dogs.flatMap((dog) => [dog.mother_dog_id, dog.father_dog_id]).filter(Boolean))
  return dogs.filter((dog) => !(dog.name_unbekannt && parentIds.has(dog.id)))
}

// Kurzname im Filter über dem Raster: ohne "(Demo)" am Ende und ohne "Zuhause " vor einem Eigennamen
// ("Zuhause Lindenhof (Demo)" -> "Lindenhof"); "Zuhause am Deich" bleibt - "am Deich" allein läse sich seltsam.
const DEMO_SUFFIX = /\s*\(Demo\)$/
const HOME_PREFIX = /^Zuhause\s+(?=\p{Lu})/u

export function shortAreaName(name = '') {
  const short = name.replace(DEMO_SUFFIX, '').replace(HOME_PREFIX, '').trim()
  return short || name
}

// Eigene Tiere erkennt man an fehlendem shared_from (GET /api/dogs setzt es nur bei Tieren anderer Bereiche).
const isOwn = (dog) => !dog.shared_from

function ownGroup(family, dogs) {
  const base = { key: 'eigen', param: OWN_GROUP_PARAM, dogs }
  if (family.art === 'zuhause') return { ...base, kind: 'zuhause', title: 'Zuhause' }
  return { ...base, kind: family.art === 'rudel' ? 'familie' : 'bereich', title: family.name }
}

// Der eigene Bereich zuerst, danach je Eigentümer (in einer Familie: die Zuhause der Mitglieder) die hierher geteilten
// Tiere, alphabetisch. Leere Gruppen fallen weg. param: Wert für ?gruppe= (die Id des Eigentümers).
function ownerGroups(family, dogs) {
  const others = new Map()
  for (const dog of dogs.filter((entry) => !isOwn(entry))) {
    const key = dog.family_id ?? dog.shared_from
    const group = others.get(key) || { key: `bereich-${key}`, param: String(key), kind: 'zuhause', title: dog.shared_from, dogs: [] }
    others.set(key, { ...group, dogs: [...group.dogs, dog] })
  }
  const sorted = [...others.values()].sort((a, b) => a.title.localeCompare(b.title, 'de'))
  return [ownGroup(family, dogs.filter(isOwn)), ...sorted].filter((group) => group.dogs.length > 0)
}

// dogs: die Tiere des Rasters (familyAnimals) - je Eigentümer eine Gruppe (der Filter über dem Raster).
export function buildFamilyGroups({ family, dogs = [] }) {
  return { owners: ownerGroups(family, dogs) }
}

// Die per ?gruppe= gewählte Gruppe - null (alle Tiere), wenn nichts gewählt ist oder es die Gruppe nicht (mehr) gibt.
export function selectedGroup(owners, param) {
  if (!param) return null
  return owners.find((group) => group.param === param) || null
}

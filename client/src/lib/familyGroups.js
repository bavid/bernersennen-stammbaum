// Familienbande im Standard-Auftritt (Phase V3, Familienbande 2): ein Raster aller Tiere statt Generationen. Reine
// Logik für die Gruppen je Eigentümer (der eigene Bereich, die Zuhause der Mitglieder - der Filter über dem Raster), die
// Familien und befreundeten Zuhause des eigenen Zuhauses (eine leise Zeile darunter) und die Frage, ob es schon einen
// Stammbaum gibt.
import { collectNodes, computeUnions } from './pedigree.js'
import { isOwnHome } from './visits.js'

// Adresse der Familienbande: ?gruppe=eigen bzw. ?gruppe=<Bereichs-Id> wählt eine Gruppe, ohne Angabe stehen alle da.
export const GROUP_PARAM = 'gruppe'
export const OWN_GROUP_PARAM = 'eigen'

// Den Stammbaum gibt es erst, wenn eine Verpaarung eingetragen ist (events: GET /api/breeding) oder ein Tier einen
// bekannten Elternteil hat, der ebenfalls in den Daten steht - dann hätte der Baum mindestens zwei Generationen.
export function hasFamilyTree({ dogs = [], allDogs = [], events = [] } = {}) {
  if (events.length > 0) return true
  return computeUnions(collectNodes(dogs, allDogs)).length > 0
}

// 'tree' | 'families' | 'pending'. familiesView: Auftritt mit Familien-Ansicht (theme.familiesView); wantsTree:
// ?ansicht=stammbaum; loaded: Tiere und Verpaarungen sind geladen. Ein Stammbaum-Link wartet auf sie ('pending'),
// statt kurz die Familien aufblitzen zu lassen; gibt es danach keinen Stammbaum, zeigt er die Familien.
export function overviewMode({ familiesView, wantsTree, treeAvailable, loaded }) {
  if (!familiesView) return 'tree'
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

// Nur im eigenen Zuhause: je Familie, in der der Haushalt Mitglied ist, die eigenen Tiere, die er dort zeigt
// (dog.shares aus GET /api/dogs) - für die leise Zeile unter dem Raster ("Ihr zeigt Tiere auch in …").
function membershipGroups(family, dogs) {
  if (!isOwnHome(family)) return []
  return (family.memberships || []).map((membership) => ({
    id: membership.id,
    title: membership.name,
    dogs: dogs.filter((dog) => isOwn(dog) && (dog.shares || []).includes(membership.id))
  }))
}

// dogs: die Tiere des Rasters (familyAnimals). friends: Ergebnis von friendHomes (nur im eigenen Zuhause geladen,
// sonst leer).
export function buildFamilyGroups({ family, dogs = [], friends = [] }) {
  return { owners: ownerGroups(family, dogs), memberships: membershipGroups(family, dogs), friends }
}

// Die per ?gruppe= gewählte Gruppe - null (alle Tiere), wenn nichts gewählt ist oder es die Gruppe nicht (mehr) gibt.
export function selectedGroup(owners, param) {
  if (!param) return null
  return owners.find((group) => group.param === param) || null
}

// Kennzahl im Kopf der Familienbande (Audit V7a - vorher zählte "Familien" jeden Abschnitt, auch das eigene Zuhause und
// befreundete Zuhause): im eigenen Zuhause die Familien, in denen es Mitglied ist; in einer Familie die Zuhause, die
// Tiere hierher teilen (dieselben, nach denen der Filter über dem Raster sortiert). null: nichts Sinnvolles zu zählen
// (zu Besuch, Familie ohne geteilte Tiere) - dann keine Kennzahl.
export function familyStat(family, { owners, memberships }) {
  if (family.art === 'rudel') {
    const homes = owners.filter((group) => group.key !== 'eigen').length
    return homes > 0 ? { value: homes, label: 'Zuhause' } : null
  }
  if (!isOwnHome(family)) return null
  return { value: memberships.length, label: memberships.length === 1 ? 'Familie' : 'Familien' }
}

// Befreundete Zuhause (Phase V2, GET /api/besuche): beide Richtungen zusammengeführt, alphabetisch. canVisit: man ist
// dort zu Besuch (besuche) und kann hineinwechseln - wer nur bei euch zu Gast ist (gaeste), steht ohne Link da.
export function friendHomes(visits) {
  const homes = new Map()
  for (const host of visits?.besuche || []) homes.set(host.id, { id: host.id, name: host.name, canVisit: true })
  for (const guest of visits?.gaeste || []) {
    if (!homes.has(guest.id)) homes.set(guest.id, { id: guest.id, name: guest.name, canVisit: false })
  }
  return [...homes.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

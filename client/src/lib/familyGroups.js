// Familienbande im Standard-Auftritt (Phase V3): zuerst Familien statt Generationen. Reine Logik für die Abschnitte
// (eigener Bereich, die Zuhause der Mitglieder, die Familien des eigenen Zuhauses, befreundete Zuhause), die
// Beziehungs-Chips an den Karten und die Frage, ob es schon einen Stammbaum gibt.
import { collectNodes, computeUnions } from './pedigree.js'
import { displayName } from './timeline.js'
import { isOwnHome } from './visits.js'

// Bis zu so vielen Namen stehen ausgeschrieben im Chip ("A, B und C"), darüber "A, B und 2 weiteren".
const MAX_NAMES = 3
const NAMES_BEFORE_REST = 2

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

// "Cora", "Cora und Dante", "A, B und C", "A, B und 2 weiteren"
export function nameList(dogs) {
  const names = dogs.map(displayName)
  if (names.length <= 1) return names.join('')
  if (names.length <= MAX_NAMES) return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`
  return `${names.slice(0, NAMES_BEFORE_REST).join(', ')} und ${names.length - NAMES_BEFORE_REST} weiteren`
}

const isParentOf = (parent) => (node) => node.mother_dog_id === parent.id || node.father_dog_id === parent.id

// Chips an einer Karte: [{ kind, text }] - "Mutter von …"/"Vater von …", "Kind von …", "Geschwister von …" (mindestens
// ein gemeinsamer Elternteil), "lebt mit …". nodes: alle Tiere, die der Bereich kennt (collectNodes), links: die
// "lebt zusammen"-Paare (GET /api/dogs/links). Verweise auf Tiere außerhalb von nodes zählen nicht.
export function relationChips(dog, nodes, links = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const others = nodes.filter((node) => node.id !== dog.id)
  const parents = [dog.mother_dog_id, dog.father_dog_id].filter(Boolean).map((id) => byId.get(id)).filter(Boolean)
  const children = others.filter(isParentOf(dog))
  const siblings = others.filter((node) => !children.includes(node) && parents.some((parent) => isParentOf(parent)(node)))
  const mates = links
    .filter((link) => link.dog_a_id === dog.id || link.dog_b_id === dog.id)
    .map((link) => byId.get(link.dog_a_id === dog.id ? link.dog_b_id : link.dog_a_id))
    .filter(Boolean)

  const chips = []
  if (children.length) {
    chips.push({ kind: 'kinder', text: `${dog.geschlecht === 'huendin' ? 'Mutter' : 'Vater'} von ${nameList(children)}` })
  }
  if (parents.length) chips.push({ kind: 'eltern', text: `Kind von ${nameList(parents)}` })
  if (siblings.length) chips.push({ kind: 'geschwister', text: `Geschwister von ${nameList(siblings)}` })
  if (mates.length) chips.push({ kind: 'mitbewohner', text: `lebt mit ${nameList(mates)}` })
  return chips
}

// Eigene Tiere erkennt man an fehlendem shared_from (GET /api/dogs setzt es nur bei Tieren anderer Bereiche).
const isOwn = (dog) => !dog.shared_from

function ownGroup(family, dogs) {
  if (family.art === 'zuhause') return { key: 'eigen', kind: 'zuhause', title: 'Zuhause', dogs }
  return { key: 'eigen', kind: family.art === 'rudel' ? 'familie' : 'bereich', title: family.name, dogs }
}

// Der eigene Bereich zuerst, danach je Eigentümer (in einer Familie: die Zuhause der Mitglieder) die hierher geteilten
// Tiere, alphabetisch. Leere Gruppen fallen weg.
function ownerGroups(family, dogs) {
  const others = new Map()
  for (const dog of dogs.filter((entry) => !isOwn(entry))) {
    const key = dog.family_id ?? dog.shared_from
    const group = others.get(key) || { key: `bereich-${key}`, kind: 'zuhause', title: dog.shared_from, dogs: [] }
    others.set(key, { ...group, dogs: [...group.dogs, dog] })
  }
  const sorted = [...others.values()].sort((a, b) => a.title.localeCompare(b.title, 'de'))
  return [ownGroup(family, dogs.filter(isOwn)), ...sorted].filter((group) => group.dogs.length > 0)
}

// Nur im eigenen Zuhause: je Familie, in der der Haushalt Mitglied ist, die eigenen Tiere, die er dort zeigt
// (dog.shares aus GET /api/dogs). Die Tiere der anderen Mitglieder sieht man, wenn man die Familie öffnet.
function membershipGroups(family, dogs) {
  if (!isOwnHome(family)) return []
  return (family.memberships || []).map((membership) => ({
    key: `familie-${membership.id}`,
    kind: 'familie',
    id: membership.id,
    title: membership.name,
    rolle: membership.rolle,
    dogs: dogs.filter((dog) => isOwn(dog) && (dog.shares || []).includes(membership.id))
  }))
}

// friends: Ergebnis von friendHomes (nur im eigenen Zuhause geladen, sonst leer).
export function buildFamilyGroups({ family, dogs = [], friends = [] }) {
  return { owners: ownerGroups(family, dogs), memberships: membershipGroups(family, dogs), friends }
}

// Kennzahl "Familien" im Kopf der Seite: jeder Abschnitt und jedes befreundete Zuhause.
export function countFamilyGroups({ owners, memberships, friends }) {
  return owners.length + memberships.length + friends.length
}

// Befreundete Zuhause (Phase V2, GET /api/besuche): beide Richtungen zusammengeführt. canVisit: man ist dort zu
// Besuch (besuche) und kann es ansehen. tiere: nur, was die "Erlebt mit"-Liste ohnehin zeigt (GET /api/erlebt-mit/tiere:
// Name und Tierart, kein Foto) - keine neuen Daten.
export function friendHomes(visits, tiere = []) {
  const homes = new Map()
  for (const host of visits?.besuche || []) homes.set(host.id, { id: host.id, name: host.name, canVisit: true })
  for (const guest of visits?.gaeste || []) {
    if (!homes.has(guest.id)) homes.set(guest.id, { id: guest.id, name: guest.name, canVisit: false })
  }
  return [...homes.values()]
    .map((entry) => ({
      ...entry,
      tiere: (tiere || [])
        .filter((tier) => tier.zuhauseId === entry.id)
        .map((tier) => ({ id: tier.id, name: tier.name, name_unbekannt: tier.nameUnbekannt, tierart: tier.tierart }))
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

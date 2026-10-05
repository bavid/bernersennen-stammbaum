// Raster „Alle“ der Tiere (Phase W, Schritt 4 „Alle Tiere an einem Ort“): reine Logik für die Filter je Bereich, die Links
// und das Raster einer Gruppenseite. Die Tiere kommen auf /tiere aus GET /api/tiere ({ tiere, areas } - jedes Tier einmal, mit
// area { id, name, art: 'eigen' | 'familie' | 'besuch' }, auch_in (Ids weiterer Bereiche, die es zeigen) und zuhause), auf
// der Gruppenseite aus den Tieren des Bereichs (areaGrid unten, dieselbe Form).
import { HOME_LABEL } from './areas.js'
import { OWN_GROUP_PARAM, familyAnimals, withoutDemoSuffix } from './familyGroups.js'

// Wert für ?gruppe=: das eigene Zuhause heißt „eigen“, jeder andere Bereich trägt seine Id.
export function areaParam(area) {
  return area.art === 'eigen' ? OWN_GROUP_PARAM : String(area.id)
}

// Name am Filter: „Mein Zuhause“, sonst der Name des Bereichs ohne „(Demo)“ - „Familie Sonnenhang“, „Zuhause Möwenweg“.
export function areaLabel(area) {
  return area.art === 'eigen' ? HOME_LABEL : withoutDemoSuffix(area.name)
}

// Die Filter über dem Raster: je Bereich mit Tieren einer (in der Reihenfolge der Bereiche) - mit nur einem Bereich keiner.
export function gridGroups(areas = []) {
  const groups = areas
    .filter((area) => area.anzahl > 0)
    .map((area) => ({ param: areaParam(area), label: areaLabel(area), title: area.name, count: area.anzahl, areaId: area.id }))
  return groups.length > 1 ? groups : []
}

// Die per ?gruppe= gewählte Gruppe - null (alle), wenn nichts gewählt ist oder es die Gruppe nicht (mehr) gibt.
export function selectedGridGroup(groups, param) {
  if (!param) return null
  return groups.find((group) => group.param === param) || null
}

// Die Tiere unter einem gewählten Filter (Audit W, M5): die im Bereich einsortierten und die, die er zusätzlich zeigt
// (auch_in aus GET /api/tiere - ein eigenes, in die Familie geteiltes Tier steht in „Alle“ nur einmal, unter „Mein Zuhause“,
// gehört aber zur Familie wie auf deren Karte). Ohne Wahl alle.
export function animalsInGroup(tiere, group) {
  if (!group) return tiere
  return tiere.filter((animal) => animal.area.id === group.areaId || (animal.auch_in ?? []).includes(group.areaId))
}

// Wohin eine Karte führt: ein eigenes Tier ins eigene Zuhause (ohne Angabe), jedes andere in seinen Bereich (?in=, das
// AreaGate wechselt dorthin).
export function animalLink(animal) {
  const id = encodeURIComponent(animal.id)
  if (!animal.area || animal.area.art === 'eigen') return `/tier/${id}`
  return `/tier/${id}?in=${encodeURIComponent(animal.area.id)}`
}

// Gruppenseite (Familie oder befreundetes Zuhause, der Bereich ist aktiv): die Tiere des Bereichs (GET /api/dogs) in der Form
// von GET /api/tiere - alle in diesem einen Bereich. zuhause wie überall: wo das Tier wohnt (shared_from nennt den Eigentümer,
// wenn es nicht dem Bereich selbst gehört), nie das eigene Zuhause. Platzhalter für unbekannte Eltern nicht (familyAnimals).
// Reihenfolge wie GET /api/tiere innerhalb eines Bereichs: erst die Tiere, die noch da sind, dann die gegangenen, je nach Namen.
const goneLast = (a, b) => Number(Boolean(a.bei_uns_bis)) - Number(Boolean(b.bei_uns_bis))
const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'de') || a.id - b.id

export function areaGrid(family, dogs, { visiting = false } = {}) {
  if (!dogs) return null
  const area = { id: family.id, name: family.name, art: visiting ? 'besuch' : 'familie' }
  const ownHomeId = family.home?.id
  const tiere = familyAnimals(dogs)
    .map((dog) => ({
      ...dog,
      area,
      zuhause: dog.shared_from && dog.family_id !== ownHomeId ? dog.shared_from : null,
      letzte_erinnerung: dog.latest_entry_datum ?? null
    }))
    .sort((a, b) => goneLast(a, b) || byName(a, b))
  return { tiere, areas: [{ ...area, anzahl: tiere.length }] }
}

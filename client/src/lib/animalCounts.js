// Phase W, Schritt 2: EINE Zählung der Tiere einer Familie bzw. eines besuchten Zuhauses für alle Stellen (Familien-Liste,
// Kopf der Gruppenseite, Einstellungen, Start): "21 Tiere · davon 4 von euch" - alle Tiere, die man dort sieht, und
// davon die eigenen, die der Haushalt dorthin teilt. Die Zahlen kommen aus GET /api/me (server/lib/areaCounts.js:
// memberships[].tiere/eigeneTiere, besuche[].tiere); fehlen sie, zählt countsFromDogs die geladenen Tiere gleich.
import { familyAnimals } from './familyGroups.js'

export function animalCountText(counts, words) {
  if (!counts || !Number.isInteger(counts.tiere)) return null
  const base = `${counts.tiere} ${counts.tiere === 1 ? words.animal : words.animals}`
  return counts.eigeneTiere > 0 ? `${base} · davon ${counts.eigeneTiere} von euch` : base
}

// { tiere, eigeneTiere } eines Bereichs aus me (Mitgliedschaft oder Besuch), null ohne Zahl.
export function areaCounts(family, areaId) {
  const membership = (family?.memberships || []).find((entry) => entry.id === areaId)
  if (membership) return Number.isInteger(membership.tiere) ? { tiere: membership.tiere, eigeneTiere: membership.eigeneTiere || 0 } : null
  const visit = (family?.besuche || []).find((entry) => entry.id === areaId)
  return visit && Number.isInteger(visit.tiere) ? { tiere: visit.tiere, eigeneTiere: 0 } : null
}

// Dieselbe Zählung aus den geladenen Tieren eines Bereichs (GET /api/dogs): ohne Platzhalter unbekannter Eltern; eigene
// sind die Tiere des Zuhauses homeId.
export function countsFromDogs(dogs, homeId) {
  if (!dogs) return null
  const animals = familyAnimals(dogs)
  return { tiere: animals.length, eigeneTiere: animals.filter((dog) => dog.family_id === homeId).length }
}

// Nach einer Änderung der Freigaben (Einstellungen): die neue Zahl der eigenen Tiere, die Gesamtzahl zieht mit.
export function withOwnShared(counts, ownShared) {
  if (!counts) return null
  if (!Number.isInteger(ownShared)) return counts
  return { tiere: counts.tiere - counts.eigeneTiere + ownShared, eigeneTiere: ownShared }
}

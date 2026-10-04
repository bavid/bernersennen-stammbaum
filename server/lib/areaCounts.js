'use strict'

// Phase W, Schritt 2: EINE Zählung der Tiere eines Bereichs für alle Stellen des Clients ("21 Tiere · davon 4 von euch",
// client/src/lib/animalCounts.js) - die Familien-Liste, der Kopf der Gruppenseite, die Einstellungen und Start lesen sie
// aus GET /api/me. Gezählt wird, was man im Bereich sieht (eigene und hierher geteilte Tiere, wie VISIBLE_DOGS_SQL in
// lib/context.js), ohne die Platzhalter unbekannter Eltern (name_unbekannt und Elternteil eines sichtbaren Tiers) - wie
// das Raster des Clients (lib/familyGroups.js familyAnimals).

const db = require('../db')

const VISIBLE_SQL = '(SELECT id FROM dogs WHERE family_id = @areaId UNION SELECT dog_id FROM dog_shares WHERE family_id = @areaId)'

const animalCountStmt = db.prepare(
  `SELECT COUNT(*) AS n FROM dogs d
   WHERE d.id IN ${VISIBLE_SQL}
     AND NOT (d.name_unbekannt = 1 AND EXISTS (
       SELECT 1 FROM dogs c WHERE (c.mother_dog_id = d.id OR c.father_dog_id = d.id) AND c.id IN ${VISIBLE_SQL}
     ))`
)

// Eigene Tiere des Haushalts homeId, die er in die Familie groupId teilt.
const ownSharedStmt = db.prepare(
  `SELECT COUNT(*) AS n FROM dog_shares s JOIN dogs d ON d.id = s.dog_id
   WHERE s.family_id = @groupId AND d.family_id = @homeId`
)

function animalCount(areaId) {
  return animalCountStmt.get({ areaId }).n
}

function ownSharedCount(homeId, groupId) {
  return ownSharedStmt.get({ homeId, groupId }).n
}

// me.memberships bzw. me.besuche mit den Zahlen: tiere je Familie samt eigeneTiere, je besuchtem Zuhause nur tiere.
function withMembershipCounts(homeId, memberships) {
  return memberships.map((membership) => ({
    ...membership,
    tiere: animalCount(membership.id),
    eigeneTiere: ownSharedCount(homeId, membership.id)
  }))
}

function withVisitCounts(visits) {
  return visits.map((visit) => ({ ...visit, tiere: animalCount(visit.id) }))
}

module.exports = { animalCount, ownSharedCount, withMembershipCounts, withVisitCounts }

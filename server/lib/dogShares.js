'use strict'

// Familien-Freigaben eines Tiers ("In Familien zeigen", routes/dogs.js PUT /:id/shares): nur Familien (art 'rudel').
// Die Tierheim-Freigabe (dog_shares mit einer Tierheim-Familie, "Tierheim darf mitlesen", PUT /:id/shelter-share)
// ist eine eigene Einwilligung und gehört nie in diese Listen (security-review Phase T Finding 2). Eine Regel, zwei
// Abfragen: je Tier (GET /:id, PUT /:id/shares) und für alle eigenen Tiere eines Bereichs auf einmal (GET /, Phase V3).

const db = require('../db')

const RUDEL_SHARES_SQL = `FROM dog_shares ds JOIN families f ON f.id = ds.family_id AND f.art = 'rudel'`

const listForDog = db.prepare(`SELECT ds.family_id ${RUDEL_SHARES_SQL} WHERE ds.dog_id = ? ORDER BY ds.family_id`)
const listForArea = db.prepare(
  `SELECT ds.dog_id, ds.family_id ${RUDEL_SHARES_SQL}
   JOIN dogs d ON d.id = ds.dog_id
   WHERE d.family_id = ? ORDER BY ds.family_id`
)

// Familien-Ids, in denen dogId gezeigt wird (aufsteigend).
function rudelSharesOf(dogId) {
  return listForDog.all(dogId).map((row) => row.family_id)
}

// Map dogId -> Familien-Ids (aufsteigend) für alle Tiere, die dem Bereich familyId gehören.
function rudelSharesByOwnDog(familyId) {
  const byDog = new Map()
  for (const { dog_id: dogId, family_id: shareFamilyId } of listForArea.all(familyId)) {
    byDog.set(dogId, [...(byDog.get(dogId) || []), shareFamilyId])
  }
  return byDog
}

module.exports = { rudelSharesOf, rudelSharesByOwnDog }

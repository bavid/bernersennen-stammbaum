'use strict'

// Phase V2: Besuche und „Erlebt mit“ der Demo (seed/demo-visits.js). Läuft innerhalb der replaceDemoPack-Transaktion
// (lib/demoPack.js), NACH den Demo-Haushalten (lib/demoMembers.js) und „Zuhause am Deich“ (braucht beider Ids).
// Alles hängt an Demo-Familien: besuche verschwinden per ON DELETE CASCADE mit ihnen, erlebt_mit mit den Einträgen
// und Tieren, die Foto-Kopien räumt deleteFamily (photoUrlsOf) beim nächsten Demo-Wechsel weg - keine Waisen.

const { VISIT_HOST_NAME, HOST_ENTRIES, HOME_ENTRIES, HOST_GREETINGS } = require('../seed/demo-visits')

const STATUS_VALUES = ['offen', 'bestaetigt']

const insertEntrySql = `INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, text, foto_urls, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`
const insertTagSql = `INSERT INTO erlebt_mit (entry_id, dog_id, status, created_at, entschieden_at)
  VALUES (?, ?, ?, datetime('now', ?), CASE WHEN ? = 'offen' THEN NULL ELSE datetime('now', ?) END)`

function assertSeedStatus(entry) {
  if (!STATUS_VALUES.includes(entry.erlebtMit.status)) throw new Error(`Demo-Eintrag "${entry.titel}": unbekannter Status`)
}

function insertTaggedEntry(db, { familyId, dogId, entry, taggedDogId, copyImage }) {
  assertSeedStatus(entry)
  if (!dogId || !taggedDogId) throw new Error(`Demo-Eintrag "${entry.titel}": Tier fehlt`)
  const fotos = (entry.fotos || []).map((file) => copyImage.copyOwn(file))
  const ago = `-${entry.hoursAgo} hours`
  const entryId = db
    .prepare(insertEntrySql)
    .run(dogId, familyId, entry.autor, entry.datum, entry.titel, entry.text, JSON.stringify(fotos), ago).lastInsertRowid
  const decidedAgo = `-${Math.max(1, entry.hoursAgo - 2)} hours`
  db.prepare(insertTagSql).run(entryId, taggedDogId, entry.erlebtMit.status, ago, entry.erlebtMit.status, decidedAgo)
  return entryId
}

// householdId: „Zuhause am Deich“, householdDogIds: dessen Tiere je Schlüssel (lib/demoPack.js createDemoHousehold);
// memberHouseholds: die frisch angelegten Demo-Haushalte (lib/demoMembers.js) - daraus der Möwenweg.
function createDemoVisits(db, { copyImage, householdId, householdDogIds, memberHouseholds }) {
  const host = memberHouseholds.find((member) => member.name === VISIT_HOST_NAME)
  if (!host) throw new Error(`Demo-Besuch: Zuhause "${VISIT_HOST_NAME}" fehlt`)
  const hostId = host.familyId
  const wilma = db.prepare("SELECT id FROM dogs WHERE family_id = ? AND name = 'Wilma'").get(hostId)
  if (!wilma) throw new Error('Demo-Besuch: Wilma fehlt')

  // Der Möwenweg ist bei „Zuhause am Deich“ noch „Neu zu Besuch“ (bestaetigt_at NULL) - so zeigt die Demo den Hinweis
  // samt „Passt“/„Gast entfernen“; der Besuch des Deichs am Möwenweg gilt dort als bestätigt.
  const insertVisit = db.prepare(
    `INSERT INTO besuche (gast_family_id, gastgeber_family_id, created_at, bestaetigt_at)
     VALUES (?, ?, datetime('now', ?), CASE WHEN ? THEN datetime('now', ?) END)`
  )
  insertVisit.run(householdId, hostId, '-40 days', 1, '-39 days')
  insertVisit.run(hostId, householdId, '-8 days', 0, null)

  const entryIds = {}
  for (const entry of HOST_ENTRIES) {
    entryIds[entry.key] = insertTaggedEntry(db, {
      familyId: hostId,
      dogId: wilma.id,
      entry,
      taggedDogId: householdDogIds[entry.erlebtMit.tier],
      copyImage
    })
  }
  for (const entry of HOME_ENTRIES) {
    entryIds[entry.key] = insertTaggedEntry(db, {
      familyId: householdId,
      dogId: householdDogIds[entry.dog],
      entry,
      taggedDogId: wilma.id,
      copyImage
    })
  }
  // Grüße des Möwenwegs als Gast (Hinweis-Glocke am Deich): family_id = author_family_id = das Zuhause des Gasts.
  const insertGreeting = db.prepare(
    `INSERT INTO entry_comments (entry_id, family_id, author_family_id, autor_name, text, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', ?))`
  )
  for (const greeting of HOST_GREETINGS) {
    if (!entryIds[greeting.entry]) throw new Error(`Demo-Gruß: Eintrag "${greeting.entry}" fehlt`)
    insertGreeting.run(entryIds[greeting.entry], hostId, hostId, greeting.autor, greeting.text, `-${greeting.hoursAgo} hours`)
  }
  return { hostId, visits: 2, entryIds }
}

module.exports = { createDemoVisits }

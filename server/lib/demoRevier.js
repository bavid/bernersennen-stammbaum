'use strict'

// Phase M „Mein Revier“ in der Demo (seed/demo-revier.js): fünf öffentliche Demo-Profile rund um „Zuhause am Deich“ und
// dessen eigenes Profil, öffentliche Tiere und Erinnerungen und Folgen in beide Richtungen. Läuft in replaceDemoPack
// innerhalb der Transaktion, NACH „Zuhause am Deich“ (braucht dessen Id). Alles hängt an frisch angelegten Demo-Familien
// (is_demo = 1): beim nächsten Auffrischen räumt deleteFamily sie samt Fotos weg, die revier_*-Zeilen gehen per
// ON DELETE CASCADE mit - idempotent, ohne Waisen. Echte Bereiche werden nie angefasst.

require('./revier') // legt die revier_*-Tabellen an
require('./profil') // bereich_profil
const { relativeDemoDate } = require('./demoDates')
const { newSlug } = require('./revierKern')
const { DEICH, PROFILE, FOLGEN } = require('../seed/demo-revier')

const insertFamilySql = `INSERT INTO families (name, password_hash, art, theme, legacy_password, is_demo)
  VALUES (?, '!', 'zuhause', 'standard', 0, 1)`
const insertDogSql = `INSERT INTO dogs (family_id, name, rasse, tierart, geschlecht, foto_url) VALUES (?, ?, ?, ?, ?, ?)`
const insertEntrySql = `INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, text, foto_urls, privat, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now', ?))`
const insertProfilSql = `INSERT INTO revier_profile (family_id, slug, aktiv, plz, zustimmung_at, anzeigename, text, ort_zeigen,
    follower_oeffentlich)
  SELECT id, ?, 1, ?, datetime('now', '-30 days'), ?, ?, ?, ? FROM families WHERE id = ? AND is_demo = 1`

function insertProfil(db, familyId, profil) {
  db.prepare(insertProfilSql).run(
    newSlug(),
    profil.plz,
    profil.name,
    profil.text,
    profil.ortZeigen ? 1 : 0,
    profil.followerOeffentlich ? 1 : 0,
    familyId
  )
}

function insertBild(db, familyId, copyImage, file) {
  const bildFile = copyImage.copyOwn(file).split('/').pop()
  db.prepare(
    `INSERT INTO bereich_profil (family_id, bild_file) SELECT id, ? FROM families WHERE id = ? AND is_demo = 1
     ON CONFLICT (family_id) DO UPDATE SET bild_file = excluded.bild_file`
  ).run(bildFile, familyId)
}

function insertEntries(db, { familyId, dogIds, profil, copyImage }) {
  // Älteste zuerst: Profil und Feed zeigen die zuletzt geschriebene Erinnerung oben (Reihenfolge der Ids).
  for (const eintrag of [...profil.eintraege].sort((a, b) => b.tage - a.tage)) {
    const fotos = JSON.stringify((eintrag.fotos || []).map((file) => copyImage.copyOwn(file)))
    const datum = relativeDemoDate({ days: -eintrag.tage })
    const entryId = db
      .prepare(insertEntrySql)
      .run(dogIds[eintrag.tier], familyId, profil.name, datum, eintrag.titel, eintrag.text, fotos, `-${eintrag.tage * 24 - 2} hours`)
      .lastInsertRowid
    db.prepare('INSERT INTO revier_eintraege (entry_id) VALUES (?)').run(entryId)
  }
}

function createProfilHousehold(db, profil, copyImage) {
  const familyId = Number(db.prepare(insertFamilySql).run(profil.familie).lastInsertRowid)
  const dogIds = {}
  for (const tier of profil.tiere) {
    const foto = copyImage.copyOwn(tier.foto)
    dogIds[tier.name] = Number(db.prepare(insertDogSql).run(familyId, tier.name, tier.rasse, tier.tierart, tier.geschlecht, foto).lastInsertRowid)
    db.prepare('INSERT INTO revier_tiere (dog_id) VALUES (?)').run(dogIds[tier.name])
  }
  insertEntries(db, { familyId, dogIds, profil, copyImage })
  insertProfil(db, familyId, profil)
  if (profil.bild) insertBild(db, familyId, copyImage, profil.bild)
  return familyId
}

// „Zuhause am Deich“: eigenes Profil mit zwei öffentlichen Tieren und zwei geteilten (nie privaten) Erinnerungen.
function createDeichProfil(db, homeId) {
  insertProfil(db, homeId, { ...DEICH, ortZeigen: false, followerOeffentlich: true })
  for (const name of DEICH.tiere) {
    db.prepare('INSERT OR IGNORE INTO revier_tiere (dog_id) SELECT id FROM dogs WHERE family_id = ? AND name = ?').run(homeId, name)
  }
  for (const titel of DEICH.eintraege) {
    db.prepare(
      `INSERT OR IGNORE INTO revier_eintraege (entry_id) SELECT id FROM timeline_entries
       WHERE family_id = ? AND titel = ? AND privat = 0 AND id NOT IN (SELECT entry_id FROM gesundheit_eintraege)`
    ).run(homeId, titel)
  }
}

// Zwei Schritte, weil POST /api/demo im NEUESTEN Demo-Zuhause landet (routes/auth.js findDemoFamily, ORDER BY id DESC):
// die Profil-Zuhause entstehen VOR „Zuhause am Deich“ (createDemoRevierProfile), dessen Profil und die Folgen danach
// (linkDemoRevier). Gibt die Ids je Schlüssel zurück.
function createDemoRevierProfile(db, { copyImage }) {
  const ids = {}
  for (const profil of PROFILE) ids[profil.key] = createProfilHousehold(db, profil, copyImage)
  return ids
}

function linkDemoRevier(db, { homeId, ids }) {
  const all = { ...ids, deich: homeId }
  createDeichProfil(db, homeId)
  const follow = db.prepare("INSERT OR IGNORE INTO revier_follows (follower_id, profil_id, created_at) VALUES (?, ?, datetime('now', ?))")
  FOLGEN.forEach(([wer, wem], index) => follow.run(all[wer], all[wem], `-${index + 1} days`))
  return all
}

module.exports = { createDemoRevierProfile, linkDemoRevier }

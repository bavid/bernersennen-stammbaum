'use strict'

// Phase R Task 3: die weiteren Demo-Haushalte der Demo-Familie (seed/demo-members.js) - je Rolle einer, mit
// Mitgliedschaft samt Rolle, geteilten Tieren, einem Kommentar des Gasts und einer offenen Einladung mit Rolle.
// Läuft innerhalb der replaceDemoPack-Transaktion (lib/demoPack.js), NACH der Demo-Familie (braucht deren Id)
// und VOR "Zuhause am Deich": POST /api/demo landet im neuesten Demo-Zuhause (routes/auth.js findDemoFamily,
// ORDER BY id DESC) - das soll die Leitung "Zuhause am Deich" bleiben, nicht der Gast.
// Die Haushalte haben weder Passwort noch Schlüssel (password_hash '!', legacy_password 0, wie das Demo-
// Tierheim) - hinein kommt niemand, sie sind nur als Mitglieder sichtbar. Alle is_demo = 1: replaceDemoPack
// räumt sie beim nächsten Lauf mit deleteFamily weg (Mitgliedschaften, Freigaben, Kommentare inklusive).
// Ein Tier mit `tierheim` (Pepper) kam aus dem Demo-Tierheim (shelterFamilyId, läuft NACH lib/demoPack.js
// createDemoShelter): wie Nele (lib/demoPack.js createDemoHousehold) mit Übergabe, Mitlese-Freigabe und frühen
// Tierheim-Einträgen - der zweite Schützling für „So geht es euren Schützlingen“ (lib/schuetzlinge.js).

const { MEMBERS, LEITUNG_COMMENT, INVITE } = require('../seed/demo-members')
const { isRole } = require('./roles')
const { createBatch, DEMO_BATCH_KIND } = require('./vouchers')
const { relativeDemoDate } = require('./demoDates')

const insertFamilySql = `INSERT INTO families (name, password_hash, art, theme, legacy_password, is_demo)
  VALUES (?, '!', 'zuhause', 'standard', 0, 1)`
const insertMembershipSql = `INSERT INTO family_members (member_family_id, group_family_id, rolle, created_at)
  VALUES (?, ?, ?, datetime('now', ?))`
const insertDogSql = `INSERT INTO dogs (family_id, name, rasse, tierart, geschlecht, geburtsdatum, foto_url, beschreibung,
    bei_uns_seit, herkunft_art, herkunft_text)
  VALUES (@familyId, @name, @rasse, @tierart, @geschlecht, @geburtsdatum, @fotoUrl, @beschreibung, @beiUnsSeit, @herkunftArt, @herkunftText)`
// Ohne hoursAgo wie lib/demoPack.js: am Tag der Erinnerung selbst geschrieben (18 Uhr).
const insertEntrySql = `INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, text, foto_urls, privat, kategorie,
    herkunft_family_id, created_at)
  VALUES (@dogId, @familyId, @autor, @datum, @titel, @text, @fotos, @privat, @kategorie, @herkunftId,
    COALESCE(datetime('now', @writtenAgo), datetime(@datum, '+18 hours')))`
const insertCommentSql = `INSERT INTO entry_comments (entry_id, family_id, author_family_id, autor_name, text, created_at)
  VALUES (?, ?, ?, ?, ?, datetime('now', ?))`

// Seed-Fehler früh und benannt: eine unbekannte Rolle im Seed darf nie stillschweigend in der DB landen.
function assertSeedRole(rolle, label) {
  if (!isRole(rolle)) throw new Error(`${label}: unbekannte Rolle "${rolle}"`)
}

// datum oder relativ ({ tage, jahre }: der Tag `tage` nach heute, `jahre` früher - lib/demoDates.js, wie lib/demoPack.js).
function entryDate(eintrag) {
  return eintrag.relativ ? relativeDemoDate({ days: eintrag.relativ.tage, years: eintrag.relativ.jahre }) : eintrag.datum
}

// Eine Erinnerung eines Demo-Haushalts: fotos als eigene Kopie je Eintrag (copyImage.copyOwn, wie lib/demoPack.js),
// autor (sonst die Persona des Haushalts), privat, kategorie; herkunftShelter verknüpft einen frühen Tierheim-Eintrag mit
// dem Demo-Tierheim (herkunft_family_id - genau die Spalte, die lib/transfers.js transferDog beim echten Umzug setzt).
function insertEntry(db, eintrag, { dogId, familyId, autor, copyImage, shelterFamilyId }) {
  if (eintrag.herkunftShelter && !shelterFamilyId) throw new Error(`Demo-Eintrag "${eintrag.titel}": kein Demo-Tierheim`)
  const datum = entryDate(eintrag)
  return db.prepare(insertEntrySql).run({
    dogId,
    familyId,
    autor: eintrag.autor || autor,
    datum,
    titel: eintrag.titel,
    text: eintrag.text || null,
    fotos: JSON.stringify((eintrag.fotos || []).map((file) => copyImage.copyOwn(file))),
    privat: eintrag.privat ? 1 : 0,
    kategorie: eintrag.kategorie || null,
    herkunftId: eintrag.herkunftShelter ? shelterFamilyId : null,
    writtenAgo: eintrag.hoursAgo ? `-${eintrag.hoursAgo} hours` : null
  }).lastInsertRowid
}

// Ein vermitteltes Tier (animal.tierheim): Übergabe aus dem Demo-Tierheim ins Zuhause (dog_transfers, ohne Gutschein -
// reine Seed-Historie wie bei Nele), „darf mitlesen“ samt Happy-End-Einwilligung (dog_shares.story_consent) und ein Gruß
// des Tierheims auf die Haupterinnerung (entryId) - in seinem eigenen Bereich geschrieben, wie routes/timeline.js es täte.
function linkShelterWard(db, { dogId, familyId, entryId, tierheim, shelterFamilyId }) {
  if (!shelterFamilyId) throw new Error('Demo-Schützling ohne Demo-Tierheim')
  db.prepare('INSERT INTO dog_transfers (dog_id, from_family_id, to_family_id, voucher_id) VALUES (?, ?, ?, NULL)').run(dogId, shelterFamilyId, familyId)
  db.prepare('INSERT INTO dog_shares (dog_id, family_id, story_consent) VALUES (?, ?, ?)').run(dogId, shelterFamilyId, tierheim.storyConsent ? 1 : 0)
  if (tierheim.gruss && entryId) {
    const { autor, text, hoursAgo } = tierheim.gruss
    db.prepare(insertCommentSql).run(entryId, shelterFamilyId, shelterFamilyId, autor, text, `-${hoursAgo} hours`)
  }
}

function insertAnimal(db, animal, { familyId, copyImage }) {
  return db.prepare(insertDogSql).run({
    familyId,
    name: animal.name,
    rasse: animal.rasse || null,
    tierart: animal.tierart,
    geschlecht: animal.geschlecht,
    geburtsdatum: animal.geburtsdatum || null,
    fotoUrl: animal.foto ? copyImage(animal.foto) : null,
    beschreibung: animal.beschreibung || null,
    beiUnsSeit: animal.beiUnsSeitTage !== undefined ? relativeDemoDate({ days: animal.beiUnsSeitTage }) : animal.beiUnsSeit || null,
    herkunftArt: animal.herkunftArt || null,
    herkunftText: animal.herkunftText || null
  }).lastInsertRowid
}

function insertMemberHousehold(db, member, { copyImage, groupFamilyId, shelterFamilyId }) {
  assertSeedRole(member.rolle, `Demo-Haushalt "${member.name}"`)
  const familyId = db.prepare(insertFamilySql).run(member.name).lastInsertRowid
  db.prepare(insertMembershipSql).run(familyId, groupFamilyId, member.rolle, `-${member.seitTagen} days`)

  const share = db.prepare('INSERT INTO dog_shares (dog_id, family_id) VALUES (?, ?)')
  const entryIds = {}
  for (const animal of member.tiere) {
    const dogId = insertAnimal(db, animal, { familyId, copyImage })
    const context = { dogId, familyId, autor: member.autor, copyImage, shelterFamilyId }
    if (animal.eintrag) entryIds[animal.key] = insertEntry(db, animal.eintrag, context)
    for (const eintrag of animal.chronik || []) insertEntry(db, eintrag, context)
    if (animal.teilen) share.run(dogId, groupFamilyId)
    if (animal.tierheim) linkShelterWard(db, { dogId, familyId, entryId: entryIds[animal.key], tierheim: animal.tierheim, shelterFamilyId })
  }
  return { familyId, rolle: member.rolle, entryIds }
}

// Kommentare der Demo-Haushalte in der Familie (family_id = Familie, author_family_id = Haushalt) auf Einträge
// geteilter Tiere anderer Demo-Haushalte - erst nach allen Haushalten, damit jeder Eintrag schon da ist.
function insertMemberComments(db, households, groupFamilyId) {
  const insertComment = db.prepare(insertCommentSql)
  const entryByAnimal = Object.assign({}, ...households.map((household) => household.entryIds))
  let count = 0
  for (const member of MEMBERS) {
    const household = households.find((h) => h.name === member.name)
    for (const comment of member.kommentare || []) {
      const entryId = entryByAnimal[comment.tier]
      if (!entryId) throw new Error(`Demo-Kommentar von "${member.name}": kein Eintrag für das Tier "${comment.tier}"`)
      insertComment.run(entryId, groupFamilyId, household.familyId, member.autor, comment.text, `-${comment.hoursAgo} hours`)
      count += 1
    }
  }
  return count
}

// Eine offene Einladung der Demo-Familie mit Rolle (seed/demo-members.js INVITE), als Stapel der Art
// DEMO_BATCH_KIND: /check kennt sie nicht, einlösen geht nie (lib/vouchers.js assertVoucherOpen) - egal, wer
// den Code kennt. code_cipher bleibt darum wie bei jedem offenen Gutschein stehen (die Admin-Stapelansicht
// entschlüsselt offene Codes und dürfte hier nicht auf NULL treffen). Die Mitglieder-Seite zeigt nur den
// Hinweis (die letzten vier Zeichen) und die Rolle. Mit issuedByFamilyId = Familie räumt deleteFamily den
// Gutschein samt leerem Stapel beim nächsten Demo-Wechsel weg.
function insertDemoInvite(db, groupFamilyId) {
  assertSeedRole(INVITE.rolle, 'Demo-Einladung')
  const { name } = db.prepare('SELECT name FROM families WHERE id = ?').get(groupFamilyId)
  const { batchId } = createBatch(db, {
    label: `Einladung ${name} (Demo)`,
    kind: DEMO_BATCH_KIND,
    size: 1,
    issuedByFamilyId: groupFamilyId,
    joinFamilyId: groupFamilyId,
    joinRolle: INVITE.rolle
  })
  const { id: voucherId } = db.prepare('SELECT id FROM vouchers WHERE batch_id = ?').get(batchId)
  return { batchId, voucherId, rolle: INVITE.rolle }
}

// Kommentar der Leitung "Zuhause am Deich" auf den Eintrag eines Demo-Haushalts (seed LEITUNG_COMMENT) - läuft in
// replaceDemoPack NACH createDemoHousehold (braucht dessen Id); entryIds stammen aus createDemoMembers.
function insertLeitungComment(db, { entryIds, groupFamilyId, householdId }) {
  const entryId = entryIds[LEITUNG_COMMENT.tier]
  if (!entryId) throw new Error(`Demo-Kommentar der Leitung: kein Eintrag für das Tier "${LEITUNG_COMMENT.tier}"`)
  db.prepare(insertCommentSql).run(entryId, groupFamilyId, householdId, LEITUNG_COMMENT.autor, LEITUNG_COMMENT.text, `-${LEITUNG_COMMENT.hoursAgo} hours`)
}

// shelterFamilyId: das Demo-Tierheim (für Tiere mit `tierheim`, seed/demo-members.js) - ohne eines scheitert so ein Tier.
function createDemoMembers(db, { copyImage, groupFamilyId, shelterFamilyId = null }) {
  const households = MEMBERS.map((member) => ({
    name: member.name,
    ...insertMemberHousehold(db, member, { copyImage, groupFamilyId, shelterFamilyId })
  }))
  const comments = insertMemberComments(db, households, groupFamilyId)
  const invite = insertDemoInvite(db, groupFamilyId)
  return {
    households: households.map(({ familyId, name, rolle }) => ({ familyId, name, rolle })),
    // Einträge je Tier-Schlüssel (für insertLeitungComment in replaceDemoPack)
    entryIds: Object.assign({}, ...households.map((household) => household.entryIds)),
    comments,
    invite
  }
}

module.exports = { createDemoMembers, insertLeitungComment }

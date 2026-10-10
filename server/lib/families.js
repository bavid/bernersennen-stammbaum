const fs = require('node:fs')
const path = require('node:path')
const { dogLabel } = require('./labels')
const { ensureLeitung } = require('./ensureLeitung')
const { revokeInvitesOnLeave } = require('./inviteRevocation')

function photoUrlsOf(db, familyId) {
  const dogPhotos = db.prepare('SELECT foto_url FROM dogs WHERE family_id = ? AND foto_url IS NOT NULL').all(familyId)
  const entryPhotos = db.prepare('SELECT foto_urls FROM timeline_entries WHERE family_id = ?').all(familyId)
  const breedingPhotos = db.prepare('SELECT foto_urls FROM breeding_events WHERE family_id = ?').all(familyId)
  return [
    ...dogPhotos.map((row) => row.foto_url),
    ...[...entryPhotos, ...breedingPhotos].flatMap((row) => JSON.parse(row.foto_urls))
  ]
}

// Alle Upload-URLs einer Familie laut der uploads-Tabelle - nicht nur unbenutzte (z. B. ein
// abgebrochener Upload, der nie an einem Hund/Eintrag/Wurf hängt und photoUrlsOf daher nicht sieht),
// sondern auch bereits verwendete. Ob eine davon am Ende wirklich verwaist ist, entscheidet erst der
// stillUsed-Filter unten gegen alle verbleibenden Familien.
function uploadUrlsOf(db, familyId) {
  return db
    .prepare('SELECT filename FROM uploads WHERE family_id = ?')
    .all(familyId)
    .map((row) => `/uploads/${row.filename}`)
}

// Bild des Zuhauses bzw. der Familie (lib/profil.js, eigene Datei ohne uploads-Zeile) - die Zeile selbst geht per ON DELETE
// CASCADE mit der families-Zeile. Skripte ohne die App kennen die Tabelle womöglich noch nicht.
function profilBildOf(db, familyId) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'bereich_profil'").get()) return []
  const file = db.prepare('SELECT bild_file FROM bereich_profil WHERE family_id = ?').get(familyId)?.bild_file
  return file ? [`/uploads/${file}`] : []
}

// Löscht ein Rudel komplett. Verweise aus anderen Rudeln auf seine Hunde werden zu Freitext,
// damit deren Stammbaum lesbar bleibt. Liefert die Foto-URLs, die danach niemand mehr nutzt.
function deleteFamily(db, familyId) {
  const photos = [...new Set([...photoUrlsOf(db, familyId), ...uploadUrlsOf(db, familyId), ...profilBildOf(db, familyId)])]

  db.transaction(() => {
    // Upload-Zuordnungen der Familie zuerst weg - sonst verletzt das Löschen der families-Zeile
    // unten die Fremdschlüsselprüfung (uploads.family_id REFERENCES families(id)).
    db.prepare('DELETE FROM uploads WHERE family_id = ?').run(familyId)
    // Geteilte Tiere zuerst aufräumen: sowohl Freigaben AUS diesem Bereich (F teilte an andere)
    // als auch Freigaben IN diesen Bereich (andere teilten an F, falls F ein Rudel war)
    db.prepare('DELETE FROM dog_shares WHERE family_id = ? OR dog_id IN (SELECT id FROM dogs WHERE family_id = ?)').run(
      familyId,
      familyId
    )
    const dogs = db.prepare('SELECT id, name, name_unbekannt, rasse FROM dogs WHERE family_id = ?').all(familyId)
    for (const dog of dogs) {
      const label = dogLabel(dog)
      db.prepare('UPDATE dogs SET mother_dog_id = NULL, mother_freitext = ? WHERE mother_dog_id = ? AND family_id != ?').run(label, dog.id, familyId)
      db.prepare('UPDATE dogs SET father_dog_id = NULL, father_freitext = ? WHERE father_dog_id = ? AND family_id != ?').run(label, dog.id, familyId)
      db.prepare('UPDATE breeding_events SET vater_dog_id = NULL, vater_freitext = ? WHERE vater_dog_id = ? AND family_id != ?').run(label, dog.id, familyId)
    }
    // Auch Kommentare fremder Familien auf eigenen Einträgen entfernen (sonst FK-Verletzung
    // beim gleich folgenden Löschen der Einträge, wenn eine geteilte Familie kommentiert hat)
    db.prepare('DELETE FROM entry_comments WHERE family_id = ? OR entry_id IN (SELECT id FROM timeline_entries WHERE family_id = ?)').run(
      familyId,
      familyId
    )
    db.prepare('DELETE FROM timeline_entries WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM dog_links WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM admin_messages WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM note_replies WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM notes WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM breeding_events WHERE family_id = ?').run(familyId)
    db.prepare('UPDATE dogs SET mother_dog_id = NULL, father_dog_id = NULL WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM dogs WHERE family_id = ?').run(familyId)
    // Mitgliedschaften in beide Richtungen: als beigetretener Haushalt und als Rudel mit Mitgliedern.
    // Phase R Task 2: war der Haushalt irgendwo die (einzige) Leitung, rückt dort sofort das älteste
    // verbleibende Mitglied nach (lib/ensureLeitung.js) - eine Familie ohne Leitung könnte sonst weder
    // Rollen ändern noch einladen, bis zum nächsten Serverstart (Migration in db.js).
    const ledFamilies = db
      .prepare("SELECT group_family_id FROM family_members WHERE member_family_id = ? AND rolle = 'leitung'")
      .pluck()
      .all(familyId)
    // security-review Phase V2 (M-2): wie beim Verlassen - die Einladungs-Codes, die der Haushalt kannte, gelten nicht weiter.
    for (const { group_family_id: groupId, rolle } of db
      .prepare('SELECT group_family_id, rolle FROM family_members WHERE member_family_id = ?')
      .all(familyId)) {
      revokeInvitesOnLeave(db, { homeId: familyId, groupId, role: rolle })
    }
    db.prepare('DELETE FROM family_members WHERE member_family_id = ? OR group_family_id = ?').run(familyId, familyId)
    for (const groupId of ledFamilies) ensureLeitung(db, groupId)

    // Phase 1: eigene Benutzer-Logins weg (users.family_id ist NOT NULL, kein SET NULL möglich).
    // Noch offene, selbst ausgegebene Gutscheine verschwinden mit der Familie (niemand kann sie mehr
    // einlösen) - für die Statistik interessante Zeilen (schon eingelöste, oder wo diese Familie nur
    // Ziel eines Beitritts/einer Einlösung war) bleiben, verlieren aber die tote Referenz (NULLIF).
    // Ohne das würde DELETE FROM families weiter unten mit SQLITE_CONSTRAINT_FOREIGNKEY scheitern,
    // sobald die Familie Benutzer hat, selbst Gutscheine ausgegeben hat oder z. B. als Demo-Familie
    // das join_family_id eines Admin-Gutscheins ist (etwa bei jedem replaceDemoPack-Lauf).
    db.prepare('DELETE FROM users WHERE family_id = ?').run(familyId)

    // M3: welche Stapel (voucher_batches) bestehen nur aus offenen, selbst ausgegebenen Gutscheinen
    // dieser Familie? Ids VOR dem Löschen sammeln - danach lässt sich pro Stapel prüfen, ob er leer
    // zurückbleibt (sonst bliebe so ein Stapel für immer als leerer Rest in voucher_batches liegen,
    // siehe scripts/testenv-seed.js).
    const affectedBatchIds = db
      .prepare('SELECT DISTINCT batch_id FROM vouchers WHERE issued_by_family_id = ? AND redeemed_at IS NULL')
      .all(familyId)
      .map((row) => row.batch_id)

    db.prepare('DELETE FROM vouchers WHERE issued_by_family_id = ? AND redeemed_at IS NULL').run(familyId)
    // visit_host_family_id (Phase V2) und created_by_family_id (Phase V2b), beide ohne REFERENCES, verlieren den
    // Verweis genauso; die Besuche selbst (besuche) verschwinden per ON DELETE CASCADE mit der families-Zeile.
    // Die eigene Notiz (label, z. B. ein Name) ist persönlich und geht mit ihrer Verfasserin (security-review V2, LOW-5).
    db.prepare('UPDATE vouchers SET label = NULL WHERE created_by_family_id = ?').run(familyId)
    db.prepare(
      `UPDATE vouchers SET
         issued_by_family_id = NULLIF(issued_by_family_id, @familyId),
         join_family_id = NULLIF(join_family_id, @familyId),
         redeemed_by_family_id = NULLIF(redeemed_by_family_id, @familyId),
         visit_host_family_id = NULLIF(visit_host_family_id, @familyId),
         created_by_family_id = NULLIF(created_by_family_id, @familyId)
       WHERE @familyId IN (issued_by_family_id, join_family_id, redeemed_by_family_id, visit_host_family_id, created_by_family_id)`
    ).run({ familyId })

    // Digitaler Bilderrahmen: Rahmen-Links des Zuhauses (lib/rahmenGeraete.js legt die Tabelle beim ersten require an -
    // Skripte ohne die App kennen sie womöglich noch nicht).
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'rahmen_geraete'").get()) {
      db.prepare('DELETE FROM rahmen_geraete WHERE family_id = ?').run(familyId)
    }

    db.prepare('DELETE FROM families WHERE id = ?').run(familyId)

    if (affectedBatchIds.length) {
      const deleteIfEmpty = db.prepare('DELETE FROM voucher_batches WHERE id = ? AND NOT EXISTS (SELECT 1 FROM vouchers WHERE batch_id = ?)')
      for (const batchId of affectedBatchIds) deleteIfEmpty.run(batchId, batchId)
    }
  })()

  // stillUsed zählt beides: Fotos, die noch an einem Hund/Eintrag/Wurf einer verbliebenen Familie
  // hängen, UND Dateien, die eine verbliebene Familie hochgeladen hat (auch wenn noch unbenutzt) -
  // so löscht deleteFamily nie eine Datei, die eine andere Familie hochgeladen hat.
  const stillUsed = new Set([
    ...db.prepare('SELECT id FROM families').all().flatMap((family) => photoUrlsOf(db, family.id)),
    ...db.prepare("SELECT '/uploads/' || filename AS url FROM uploads").all().map((row) => row.url)
  ])
  return [...new Set(photos)].filter((url) => !stillUsed.has(url))
}

function removeUploads(uploadDir, urls) {
  for (const url of urls) {
    fs.rmSync(path.join(uploadDir, path.basename(url)), { force: true })
  }
}

module.exports = { deleteFamily, removeUploads }

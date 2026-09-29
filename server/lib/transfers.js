const { dogLabel } = require('./labels')

// Phase T Task 3: zieht ein Tier mit seiner ganzen Chronik in ein neues Zuhause um - aufgerufen von
// lib/vouchers.js (redeemVoucher/claimVoucher), wenn ein eingelöster Gutschein eine dog_id trägt
// (Übergabe-Gutschein, siehe routes/dogs.js POST /:id/handover). Läuft in EINER Transaktion (wie
// lib/families.js deleteFamily/routes/dogs.js deleteDog, an deren Muster sich die Eltern-Verweise und
// breeding_events hier orientieren) - ein Absturz mittendrin darf das Tier nie halb umgezogen zurücklassen.
//
// breeding_events: als Vater referenziert -> Freitext (vater_freitext existiert). Als Mutter
// referenziert lässt sich das NICHT auf NULL+Freitext umstellen - mutter_dog_id ist NOT NULL und es
// gibt keine mutter_freitext-Spalte (siehe server/db.js). Genau wie beim endgültigen Löschen eines
// Tieres (routes/dogs.js deleteDog) wird die Zeile deshalb gelöscht statt zu Freitext umgestellt.
function transferDog(db, { dogId, fromFamilyId, toFamilyId, voucherId, today }) {
  return db.transaction(() => {
    const dog = db.prepare('SELECT * FROM dogs WHERE id = ?').get(dogId)
    if (!dog) throw new Error(`Tier ${dogId} nicht gefunden`)

    // herkunft_text: der admin-gepflegte Partnername (partners.name über families.partner_id), nicht
    // der vom Tierheim selbst frei änderbare Familienname - Fallback auf families.name, wenn (noch)
    // kein Partner verknüpft ist (security-review Phase T Finding 8).
    const shelter = db
      .prepare('SELECT f.name AS familyName, p.name AS partnerName FROM families f LEFT JOIN partners p ON p.id = f.partner_id WHERE f.id = ?')
      .get(fromFamilyId)
    const shelterName = shelter ? shelter.partnerName || shelter.familyName : null

    // Eigene Eltern-Verweise des Tiers zu Freitext: im neuen Zuhause sind die Eltern (Tierheim oder
    // eine andere Familie) ohne Freigabe nicht sichtbar - wie beim Löschen (dogLabel als Freitext).
    let motherDogId = dog.mother_dog_id
    let motherFreitext = dog.mother_freitext
    if (motherDogId) {
      const mother = db.prepare('SELECT name, name_unbekannt, rasse FROM dogs WHERE id = ?').get(motherDogId)
      motherFreitext = mother ? dogLabel(mother) : motherFreitext
      motherDogId = null
    }
    let fatherDogId = dog.father_dog_id
    let fatherFreitext = dog.father_freitext
    if (fatherDogId) {
      const father = db.prepare('SELECT name, name_unbekannt, rasse FROM dogs WHERE id = ?').get(fatherDogId)
      fatherFreitext = father ? dogLabel(father) : fatherFreitext
      fatherDogId = null
    }

    db.prepare(
      `UPDATE dogs SET
         family_id = @toFamilyId,
         herkunft_art = 'tierheim',
         herkunft_text = @shelterName,
         bei_uns_seit = CASE WHEN bei_uns_seit IS NULL OR bei_uns_seit = '' THEN @today ELSE bei_uns_seit END,
         vermittlung_status = 'vermittelt',
         public_slug = NULL,
         mother_dog_id = @motherDogId, mother_freitext = @motherFreitext,
         father_dog_id = @fatherDogId, father_freitext = @fatherFreitext
       WHERE id = @dogId`
    ).run({ toFamilyId, shelterName, today, dogId, motherDogId, motherFreitext, fatherDogId, fatherFreitext })

    // Die ganze Chronik zieht mit; herkunft_family_id nur setzen, wenn noch leer (ein Tier könnte
    // theoretisch später erneut umziehen - der allererste Ursprung soll sichtbar bleiben).
    db.prepare(
      `UPDATE timeline_entries SET
         family_id = @toFamilyId,
         herkunft_family_id = COALESCE(herkunft_family_id, @fromFamilyId),
         is_public = 0
       WHERE dog_id = @dogId`
    ).run({ toFamilyId, fromFamilyId, dogId })

    db.prepare('DELETE FROM dog_links WHERE dog_a_id = ? OR dog_b_id = ?').run(dogId, dogId)

    // Verweise ANDERER Tiere auf dieses Tier (als Elternteil) zu Freitext - wie beim endgültigen
    // Löschen eines Tieres (routes/dogs.js deleteDog): ohne Freigabe ist es danach nicht mehr sichtbar.
    const label = dogLabel(dog)
    db.prepare('UPDATE dogs SET mother_dog_id = NULL, mother_freitext = ? WHERE mother_dog_id = ?').run(label, dogId)
    db.prepare('UPDATE dogs SET father_dog_id = NULL, father_freitext = ? WHERE father_dog_id = ?').run(label, dogId)

    db.prepare('DELETE FROM dog_shares WHERE dog_id = ?').run(dogId)

    db.prepare('UPDATE breeding_events SET vater_dog_id = NULL, vater_freitext = ? WHERE vater_dog_id = ?').run(label, dogId)
    db.prepare('DELETE FROM breeding_events WHERE mutter_dog_id = ?').run(dogId)

    db.prepare('INSERT INTO dog_transfers (dog_id, from_family_id, to_family_id, voucher_id) VALUES (?, ?, ?, ?)').run(
      dogId,
      fromFamilyId,
      toFamilyId,
      voucherId
    )
  })()
}

// Phase R (Nachtrag zu Task 2): ein Tier der Familie (dogs.family_id = fromFamilyId, ein Rudel) in die eigene
// Chronik der Leitung übernehmen (routes/dogs.js POST /:id/uebernehmen). Anders als transferDog (Übergabe aus
// dem Tierheim an ein fremdes Zuhause) ist das nur ein Eigentümerwechsel INNERHALB der Familie - das Tier
// bleibt über eine Freigabe (dog_shares) dort sichtbar, darum bleiben alle Verweise über Tier-Ids bestehen:
// eigene Eltern, Kinder, Würfe (breeding_events), "lebt zusammen mit" (dog_links) und Kommentare. Die ganze
// Chronik zieht mit; "privat" (in der Familie: nur für die Familie) wird zu 0, denn genau dieselben Leute
// sehen die Einträge künftig über die Freigabe - mit privat = 1 verschwänden sie für die Familie.
// Herkunft nur setzen, wenn beide Felder leer sind ("aus der Familie X"), sonst bleibt die eingetragene.
// dog_transfers protokolliert den Wechsel (voucher_id NULL - kein Gutschein im Spiel, wie der Demo-Umzug in
// lib/demoPack.js); shelterShareFor in routes/dogs.js ignoriert ihn, weil die Herkunft kein Tierheim ist.
// Läuft in EINER Transaktion; wirft, wenn das Tier nicht (mehr) der Familie gehört.
function takeOverDog(db, { dogId, fromFamilyId, toFamilyId }) {
  return db.transaction(() => {
    const dog = db.prepare('SELECT id, herkunft_art, herkunft_text FROM dogs WHERE id = ? AND family_id = ?').get(dogId, fromFamilyId)
    if (!dog) throw new Error(`Tier ${dogId} gehört nicht der Familie ${fromFamilyId}`)
    const family = db.prepare('SELECT name FROM families WHERE id = ?').get(fromFamilyId)
    if (!family) throw new Error(`Familie ${fromFamilyId} nicht gefunden`)

    const keepsOrigin = Boolean(dog.herkunft_art || dog.herkunft_text)
    db.prepare(
      `UPDATE dogs SET family_id = @toFamilyId,
         herkunft_art = CASE WHEN @keepsOrigin THEN herkunft_art ELSE 'privat' END,
         herkunft_text = CASE WHEN @keepsOrigin THEN herkunft_text ELSE @herkunftText END
       WHERE id = @dogId`
    ).run({ toFamilyId, dogId, keepsOrigin: keepsOrigin ? 1 : 0, herkunftText: `aus der Familie ${family.name}` })

    db.prepare('UPDATE timeline_entries SET family_id = ?, privat = 0 WHERE dog_id = ?').run(toFamilyId, dogId)
    db.prepare('INSERT OR IGNORE INTO dog_shares (dog_id, family_id) VALUES (?, ?)').run(dogId, fromFamilyId)
    db.prepare('INSERT INTO dog_transfers (dog_id, from_family_id, to_family_id, voucher_id) VALUES (?, ?, ?, NULL)').run(
      dogId,
      fromFamilyId,
      toFamilyId
    )
  })()
}

module.exports = { transferDog, takeOverDog }

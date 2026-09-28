const db = require('../db')
const { publicPartnerSql } = require('./partners')
const { publishableSql } = require('./vermittlung')

// Phase T Task 2: welche Datei darf ohne Login über /public-media/<datei> abgerufen werden? Anders als
// lib/uploadAccess.js (canSeeUpload, das nach dem aktiven Bereich fragt) gibt es hier keinen Bereich -
// entscheidend ist ausschließlich, ob die Datei zu einem VERÖFFENTLICHTEN Steckbrief gehört: entweder
// das Titelbild eines Tiers mit gesetztem public_slug, oder ein Foto in einem öffentlichen
// (is_public = 1, nie privat) Eintrag genau dieses veröffentlichten Tiers. Dieselbe Dateinamen-Form
// wie bei /uploads (siehe dortiger Kommentar zu FILENAME_RE): nur von crypto.randomUUID() plus
// jpg/png/webp/gif erzeugte Namen kommen überhaupt in Frage - Pfad-Traversal scheitert schon daran.
const FILENAME_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i

// vermittlung_status IN (...): dieselbe Regel wie beim öffentlichen Tier-Endpunkt selbst (routes/
// publicAnimals.js findPublishedDog, lib/vermittlung.js PUBLISHABLE_STATUS inkl. "pausiert") - ein
// zurückgezogener/inzwischen vermittelter Steckbrief liefert auch für seine Fotos 404, selbst wenn
// public_slug technisch noch gesetzt wäre (Verteidigungslinie: PUT /api/dogs räumt public_slug beim
// Wechsel auf 'vermittelt' zwar schon auf, siehe routes/dogs.js).
const PUBLISHABLE_STATUS_SQL = publishableSql('d')

// security-review Phase T Finding 5: ein pausierter/Entwurf-Partner (status != 'aktiv') - und seit Phase P
// Task 1 ein gesperrter - darf auch keine Fotos mehr ausliefern - derselbe Grundsatz wie in
// routes/publicAnimals.js findShelterPartner (lib/partners.js publicPartnerSql).
const PUBLIC_PARTNER_SQL = publicPartnerSql('p')
// Finding 11: FROM dogs d (nutzt den Teil-Index idx_dogs_public_slug, siehe db.js) statt FROM
// timeline_entries - der Eintrag-Join hängt sich über idx_timeline_dog(dog_id, datum) an ein bereits
// stark eingeschränktes d, statt erst alle timeline_entries zu scannen (siehe test/publicMediaQueryPlan.test.js).
const dogPhotoStmt = db.prepare(`
  SELECT 1 FROM dogs d
  JOIN families f ON f.id = d.family_id
  JOIN partners p ON p.id = f.partner_id
  WHERE d.foto_url = @url AND d.public_slug IS NOT NULL AND ${PUBLISHABLE_STATUS_SQL} AND ${PUBLIC_PARTNER_SQL}
`)

// Als eigene Konstante exportiert, damit test/publicMediaQueryPlan.test.js den Plan GENAU dieser Abfrage
// prüft (statt einer nachgebauten Kopie, die beim nächsten Umbau still auseinanderlaufen könnte).
const ENTRY_PHOTO_SQL = `
  SELECT 1 FROM dogs d
  JOIN families f ON f.id = d.family_id
  JOIN partners p ON p.id = f.partner_id
  JOIN timeline_entries t ON t.dog_id = d.id
  WHERE d.public_slug IS NOT NULL AND ${PUBLISHABLE_STATUS_SQL} AND ${PUBLIC_PARTNER_SQL}
    AND t.is_public = 1 AND t.privat = 0 AND t.foto_urls LIKE @pattern
`
const entryPhotoStmt = db.prepare(ENTRY_PHOTO_SQL)

// Happy Ends (Phase T Task 6, routes/publicAnimals.js GET /partners/:slug/happy-ends): ein Tier, das
// dieses Tierheim einmal vermittelt hat, ist längst nicht mehr veröffentlicht (public_slug/
// vermittlung_status greifen hier also NICHT) - stattdessen zählt allein die freiwillige, jederzeit
// widerrufbare Einwilligung der neuen Familie (dog_shares.story_consent = 1, siehe routes/dogs.js PUT
// /:id/shelter-share). d.family_id != f.id ist dieselbe verteidigende Prüfung wie dort.
const storyConsentDogPhotoStmt = db.prepare(`
  SELECT 1 FROM dogs d
  JOIN dog_shares ds ON ds.dog_id = d.id AND ds.story_consent = 1
  JOIN families f ON f.id = ds.family_id AND f.art = 'tierheim' AND d.family_id != f.id
  JOIN partners p ON p.id = f.partner_id AND ${PUBLIC_PARTNER_SQL}
  WHERE d.foto_url = @url
`)

// Nur das ERSTE Foto des NEUESTEN nicht-privaten Eintrags (genau das Foto, das die Happy-End-Antwort
// als entry.fotoUrl zeigt - alle anderen Fotos dieses oder anderer Einträge bleiben 404). @firstPhotoPattern
// verlangt die Position am Anfang des JSON-Arrays (LIKE '["/uploads/…"%'), nicht irgendwo darin - anders
// als @pattern oben bei entryPhotoStmt, das absichtlich jede Position zulässt. Die Sortierung (ORDER BY
// datum DESC, id DESC) muss mit findNewestNonPrivateEntry in routes/publicAnimals.js übereinstimmen.
const storyConsentEntryPhotoStmt = db.prepare(`
  SELECT 1 FROM dog_shares ds
  JOIN dogs d ON d.id = ds.dog_id
  JOIN families f ON f.id = ds.family_id AND f.art = 'tierheim' AND d.family_id != f.id
  JOIN partners p ON p.id = f.partner_id AND ${PUBLIC_PARTNER_SQL}
  JOIN timeline_entries t ON t.dog_id = ds.dog_id AND t.privat = 0
  WHERE ds.story_consent = 1
    AND t.foto_urls LIKE @firstPhotoPattern
    AND t.id = (
      SELECT t2.id FROM timeline_entries t2 WHERE t2.dog_id = ds.dog_id AND t2.privat = 0
      ORDER BY t2.datum DESC, t2.id DESC LIMIT 1
    )
`)

// Einblicke (Phase P Task 3b, lib/einblicke.js): das Foto eines Einblicks, den der Admin nicht ausgeblendet
// hat, eines öffentlich sichtbaren Partners (aktiv, nicht gesperrt - derselbe PUBLIC_PARTNER_SQL wie oben).
// Pausiert, Entwurf, gesperrt oder ausgeblendet -> 404. idx_einblicke_foto (db.js) trägt die Suche.
const einblickPhotoStmt = db.prepare(`
  SELECT 1 FROM partner_einblicke e
  JOIN partners p ON p.id = e.partner_id
  WHERE e.foto_url = @url AND e.ausgeblendet = 0 AND ${PUBLIC_PARTNER_SQL}
`)

function canServePublicMedia(filename) {
  if (!FILENAME_RE.test(filename)) return false

  const url = `/uploads/${filename}`
  const params = { url, pattern: `%"${url}"%`, firstPhotoPattern: `["${url}"%` }
  if (dogPhotoStmt.get(params)) return true
  if (entryPhotoStmt.get(params)) return true
  if (storyConsentDogPhotoStmt.get(params)) return true
  if (storyConsentEntryPhotoStmt.get(params)) return true
  if (einblickPhotoStmt.get(params)) return true
  return false
}

module.exports = { canServePublicMedia, FILENAME_RE, ENTRY_PHOTO_SQL }

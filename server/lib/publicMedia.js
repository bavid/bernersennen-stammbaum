const db = require('../db')

// Phase T Task 2: welche Datei darf ohne Login über /public-media/<datei> abgerufen werden? Anders als
// lib/uploadAccess.js (canSeeUpload, das nach dem aktiven Bereich fragt) gibt es hier keinen Bereich -
// entscheidend ist ausschließlich, ob die Datei zu einem VERÖFFENTLICHTEN Steckbrief gehört: entweder
// das Titelbild eines Tiers mit gesetztem public_slug, oder ein Foto in einem öffentlichen
// (is_public = 1, nie privat) Eintrag genau dieses veröffentlichten Tiers. Dieselbe Dateinamen-Form
// wie bei /uploads (siehe dortiger Kommentar zu FILENAME_RE): nur von crypto.randomUUID() plus
// jpg/png/webp/gif erzeugte Namen kommen überhaupt in Frage - Pfad-Traversal scheitert schon daran.
const FILENAME_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i

// vermittlung_status IN (...): dieselbe Regel wie beim öffentlichen Tier-Endpunkt selbst (routes/
// publicAnimals.js findPublishedDog) - ein zurückgezogener/inzwischen vermittelter Steckbrief liefert
// auch für seine Fotos 404, selbst wenn public_slug technisch noch gesetzt wäre (Verteidigungslinie:
// PUT /api/dogs räumt public_slug beim Wechsel auf 'vermittelt' zwar schon auf, siehe routes/dogs.js).
const PUBLISHABLE_STATUS_SQL = "d.vermittlung_status IN ('in_vermittlung', 'reserviert')"

// security-review Phase T Finding 5: ein pausierter/Entwurf-Partner (status != 'aktiv') darf auch keine
// Fotos mehr ausliefern - derselbe Grundsatz wie in routes/publicAnimals.js findShelterPartner.
// Finding 11: FROM dogs d (nutzt den Teil-Index idx_dogs_public_slug, siehe db.js) statt FROM
// timeline_entries - der Eintrag-Join hängt sich über idx_timeline_dog(dog_id, datum) an ein bereits
// stark eingeschränktes d, statt erst alle timeline_entries zu scannen (siehe test/publicMediaQueryPlan.test.js).
const dogPhotoStmt = db.prepare(`
  SELECT 1 FROM dogs d
  JOIN families f ON f.id = d.family_id
  JOIN partners p ON p.id = f.partner_id
  WHERE d.foto_url = @url AND d.public_slug IS NOT NULL AND ${PUBLISHABLE_STATUS_SQL} AND p.status = 'aktiv'
`)

const entryPhotoStmt = db.prepare(`
  SELECT 1 FROM dogs d
  JOIN families f ON f.id = d.family_id
  JOIN partners p ON p.id = f.partner_id
  JOIN timeline_entries t ON t.dog_id = d.id
  WHERE d.public_slug IS NOT NULL AND ${PUBLISHABLE_STATUS_SQL} AND p.status = 'aktiv'
    AND t.is_public = 1 AND t.privat = 0 AND t.foto_urls LIKE @pattern
`)

function canServePublicMedia(filename) {
  if (!FILENAME_RE.test(filename)) return false

  const params = { url: `/uploads/${filename}`, pattern: `%"/uploads/${filename}"%` }
  if (dogPhotoStmt.get(params)) return true
  if (entryPhotoStmt.get(params)) return true
  return false
}

module.exports = { canServePublicMedia, FILENAME_RE }

const db = require('../db')

// Phase T Task 2: welche Datei darf ohne Login über /public-media/<datei> abgerufen werden? Anders als
// lib/uploadAccess.js (canSeeUpload, das nach dem aktiven Bereich fragt) gibt es hier keinen Bereich -
// entscheidend ist ausschließlich, ob die Datei zu einem VERÖFFENTLICHTEN Steckbrief gehört: entweder
// das Titelbild eines Tiers mit gesetztem public_slug, oder ein Foto in einem öffentlichen
// (is_public = 1, nie privat) Eintrag genau dieses veröffentlichten Tiers. Dieselbe Dateinamen-Form
// wie bei /uploads (siehe dortiger Kommentar zu FILENAME_RE): nur von crypto.randomUUID() plus
// jpg/png/webp/gif erzeugte Namen kommen überhaupt in Frage - Pfad-Traversal scheitert schon daran.
const FILENAME_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i

const dogPhotoStmt = db.prepare('SELECT 1 FROM dogs WHERE foto_url = @url AND public_slug IS NOT NULL')

const entryPhotoStmt = db.prepare(
  `SELECT 1 FROM timeline_entries t
   JOIN dogs d ON d.id = t.dog_id
   WHERE t.foto_urls LIKE @pattern AND t.is_public = 1 AND t.privat = 0 AND d.public_slug IS NOT NULL`
)

function canServePublicMedia(filename) {
  if (!FILENAME_RE.test(filename)) return false

  const params = { url: `/uploads/${filename}`, pattern: `%"/uploads/${filename}"%` }
  if (dogPhotoStmt.get(params)) return true
  if (entryPhotoStmt.get(params)) return true
  return false
}

module.exports = { canServePublicMedia, FILENAME_RE }

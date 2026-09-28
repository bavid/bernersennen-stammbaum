const path = require('node:path')
const db = require('../db')
const { VISIBLE_DOGS_SQL, VISIBLE_ENTRY_SQL } = require('./context')

// uploads.js erzeugt Dateinamen ausschließlich aus crypto.randomUUID() (36 Zeichen: Hex-Ziffern und
// Bindestriche) plus einer Endung aus EXTENSION_BY_MIME - das sind nur jpg, png, webp und gif ("jpeg"
// kommt nie vor, weil image/jpeg auf "jpg" abgebildet wird, siehe routes/uploads.js). Die Regex ist
// streng verankert (^...$) und lässt weder "%" noch "_" noch "/" zu - die LIKE-Muster unten brauchen
// deshalb kein zusätzliches Escaping, und Pfad-Traversal ("../", kodiert oder nicht) scheitert hier
// schon an der Form, bevor überhaupt eine Datei angefasst wird.
// Absichtlich NICHT für alte, ungewöhnliche Endungen von vor dem 26.09.2026 gelockert (Altbestand vor
// der strengen isUploadUrl/FILENAME_RE-Prüfung) - solche Dateien sieht nur der Admin (requireUploadAccess
// lässt Admin immer durch); ein Besitzer, der so einen Datensatz unverändert speichert, bleibt trotzdem
// möglich, weil canAttachUpload unten bereits vorhandene URLs unabhängig von canSeeUpload durchlässt.
const FILENAME_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i

// Frisches Foto: schon hochgeladen, aber noch keinem Hund/Eintrag zugeordnet. Sichtbar für die
// Familie, die es hochgeladen hat - das ist entweder der aktive Bereich (familyId) oder, falls der
// Upload aus einem anderen Bereich heraus passierte, die Login-Identität (homeId) selbst.
const uploadRowStmt = db.prepare('SELECT 1 FROM uploads WHERE filename = @filename AND family_id IN (@familyId, @homeId)')

// Hundefoto eines im Bereich sichtbaren Tiers (eigenes oder geteiltes)
const dogPhotoStmt = db.prepare(`SELECT 1 FROM dogs WHERE foto_url = @url AND id IN ${VISIBLE_DOGS_SQL}`)

// Foto in einem im Bereich sichtbaren Chronik-Eintrag (eigener oder geteilter, nicht-privater)
const entryPhotoStmt = db.prepare(
  `SELECT 1 FROM timeline_entries t WHERE foto_urls LIKE @pattern AND ${VISIBLE_ENTRY_SQL}`
)

// Foto in einem Wurf-Eintrag der eigenen Familie (Zucht-Events werden nicht geteilt)
const breedingPhotoStmt = db.prepare(
  'SELECT 1 FROM breeding_events WHERE family_id = @familyId AND foto_urls LIKE @pattern'
)

// Darf die Identität { familyId: aktiver Bereich, homeId: Login-Identität } die Upload-Datei
// "filename" abrufen? Erst die Form prüfen, danach vier unabhängige "sichtbar, weil..."-Gründe.
function canSeeUpload({ familyId, homeId }, filename) {
  if (!FILENAME_RE.test(filename)) return false

  const params = { familyId, homeId, filename, url: `/uploads/${filename}`, pattern: `%"/uploads/${filename}"%` }

  if (uploadRowStmt.get(params)) return true
  if (dogPhotoStmt.get(params)) return true
  if (entryPhotoStmt.get(params)) return true
  if (breedingPhotoStmt.get(params)) return true
  return false
}

// Für Schreibzugriffe: darf { familyId, homeId } die Foto-URL "url" an einen Hund/Eintrag/Wurf
// anhängen? Ja, wenn sie schon vorher auf genau diesem Datensatz stand (existingUrls - so bleiben
// unveränderte PUTs auch für Altbestand ohne uploads-Zeile oder mit alter Endung möglich), sonst nur
// wenn canSeeUpload das jetzt, vor dem Schreiben, bestätigt. Ohne diese Prüfung könnte jede Familie
// durch bloßes Verlinken einer fremden Foto-URL dauerhaften Lesezugriff auf ein fremdes Foto gewinnen
// (die URL taucht dann ja im eigenen, sichtbaren Datensatz auf).
function canAttachUpload({ familyId, homeId }, url, existingUrls = []) {
  if (existingUrls.includes(url)) return true
  return canSeeUpload({ familyId, homeId }, path.basename(url))
}

module.exports = { canSeeUpload, canAttachUpload, FILENAME_RE }

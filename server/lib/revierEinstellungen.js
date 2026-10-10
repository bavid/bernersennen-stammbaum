'use strict'

// Phase M „Mein Revier“: Einstellungen des Inhabers (Zuhause, in einer Familie nur die Leitung - geprüft in
// routes/revier.js). Opt-in-Regeln: einschalten nur mit bekannter PLZ und Zustimmung; Häkchen weg -> sofort aus.
// Je Tier ein Schalter (Standard aus), je Erinnerung „öffentlich“ (nie privat, nie Gesundheit). Die eigene PLZ sieht nur
// der Inhaber selbst.

const { lookupPlz } = require('./geo')
const {
  db,
  MAX_TEXT_LENGTH,
  httpError,
  hasKey,
  bildUrlOf,
  newSlug,
  cleanAnzeigename
} = require('./revierKern')

const CONTROL_CHARS = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g
const MAX_TIERE = 200
const PLZ_MISSING = 'Für ein öffentliches Profil braucht es eure Postleitzahl und euer Häkchen.'
const PLZ_UNKNOWN = 'Diese Postleitzahl kennen wir nicht'

const profilStmt = db.prepare(`SELECT p.*, f.name AS family_name, f.is_demo FROM revier_profile p
  JOIN families f ON f.id = p.family_id WHERE p.family_id = ?`)
const insertStmt = db.prepare('INSERT OR IGNORE INTO revier_profile (family_id, slug) VALUES (?, ?)')
const updateStmt = db.prepare(`UPDATE revier_profile SET aktiv = @aktiv, plz = @plz, zustimmung_at = @zustimmung_at,
  anzeigename = @anzeigename, text = @text, ort_zeigen = @ort_zeigen, follower_oeffentlich = @follower_oeffentlich,
  updated_at = datetime('now') WHERE family_id = @family_id`)
const tiereStmt = db.prepare(`
  SELECT d.id, d.name, d.tierart, d.foto_url, EXISTS (SELECT 1 FROM revier_tiere rt WHERE rt.dog_id = d.id) AS sichtbar,
    (SELECT COUNT(*) FROM timeline_entries t JOIN revier_eintraege re ON re.entry_id = t.id
       WHERE t.dog_id = d.id AND t.family_id = d.family_id AND t.privat = 0
         AND NOT EXISTS (SELECT 1 FROM gesundheit_eintraege g WHERE g.entry_id = t.id)) AS oeffentlich
  FROM dogs d WHERE d.family_id = ? AND d.name_unbekannt = 0 ORDER BY d.name COLLATE NOCASE, d.id`)
const followerCountStmt = db.prepare('SELECT COUNT(*) AS n FROM revier_follows WHERE profil_id = ?')

// Legt die Zeile beim ersten Blick an (aus, mit slug) - so funktionieren Vorschau und Bild schon vor dem Einschalten.
function ensureProfil(familyId) {
  insertStmt.run(familyId, newSlug())
  return profilStmt.get(familyId)
}

function einstellungenOf(familyId) {
  const row = ensureProfil(familyId)
  return {
    aktiv: Boolean(row.aktiv),
    plz: row.plz,
    ort: row.plz ? lookupPlz(row.plz)?.ort || null : null,
    zustimmung: Boolean(row.zustimmung_at),
    name: row.anzeigename,
    vorgabeName: row.family_name,
    text: row.text,
    ortZeigen: Boolean(row.ort_zeigen),
    followerOeffentlich: Boolean(row.follower_oeffentlich),
    gesperrt: Boolean(row.gesperrt),
    slug: row.slug,
    bild: bildUrlOf(row),
    follower: followerCountStmt.get(familyId).n,
    tiere: tiereStmt.all(familyId).map((dog) => ({ ...dog, sichtbar: Boolean(dog.sichtbar) }))
  }
}

function cleanPlz(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || !lookupPlz(value)) throw httpError(400, PLZ_UNKNOWN)
  return value
}

function cleanProfilText(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw httpError(400, 'Der Text ist ungültig')
  const text = value.replace(CONTROL_CHARS, '').trim()
  if (text.length > MAX_TEXT_LENGTH) throw httpError(400, `Der Text darf höchstens ${MAX_TEXT_LENGTH} Zeichen lang sein`)
  return text || null
}

// Nur die mitgeschickten Felder ändern sich; danach gilt die Opt-in-Regel für das Ergebnis.
function mergeEinstellungen(row, body) {
  const next = { ...row }
  if (hasKey(body, 'plz')) next.plz = cleanPlz(body.plz)
  if (hasKey(body, 'name')) next.anzeigename = body.name === null ? null : cleanAnzeigename(body.name)
  if (hasKey(body, 'text')) next.text = cleanProfilText(body.text)
  if (hasKey(body, 'ortZeigen')) next.ort_zeigen = body.ortZeigen ? 1 : 0
  if (hasKey(body, 'followerOeffentlich')) next.follower_oeffentlich = body.followerOeffentlich ? 1 : 0
  if (hasKey(body, 'zustimmung')) next.zustimmung_at = body.zustimmung ? row.zustimmung_at || new Date().toISOString() : null
  if (hasKey(body, 'aktiv')) next.aktiv = body.aktiv ? 1 : 0
  if (!next.zustimmung_at || !next.plz) {
    if (next.aktiv && hasKey(body, 'aktiv')) throw httpError(400, PLZ_MISSING)
    next.aktiv = 0
  }
  return next
}

function saveEinstellungen(familyId, body = {}) {
  const row = ensureProfil(familyId)
  updateStmt.run(mergeEinstellungen(row, body))
  return einstellungenOf(familyId)
}

const clearTiereStmt = db.prepare('DELETE FROM revier_tiere WHERE dog_id IN (SELECT id FROM dogs WHERE family_id = ?)')
const addTierStmt = db.prepare('INSERT OR IGNORE INTO revier_tiere (dog_id) SELECT id FROM dogs WHERE id = ? AND family_id = ?')

// Die Menge der öffentlichen Tiere ersetzen - fremde Ids fallen am JOIN (family_id) still heraus.
const replaceTiere = db.transaction((familyId, ids) => {
  clearTiereStmt.run(familyId)
  for (const id of ids) addTierStmt.run(id, familyId)
})

function saveTiere(familyId, ids) {
  if (!Array.isArray(ids) || ids.length > MAX_TIERE || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw httpError(400, 'Die Auswahl der Tiere ist ungültig')
  }
  ensureProfil(familyId)
  replaceTiere(familyId, [...new Set(ids)])
  return einstellungenOf(familyId)
}

const ownEntryStmt = db.prepare(`SELECT t.id, t.privat, t.kategorie,
    EXISTS (SELECT 1 FROM gesundheit_eintraege g WHERE g.entry_id = t.id) AS gesundheit,
    EXISTS (SELECT 1 FROM revier_tiere rt WHERE rt.dog_id = t.dog_id) AS tier_im_profil
  FROM timeline_entries t WHERE t.id = ? AND t.family_id = ?`)
const markStmt = db.prepare('INSERT OR IGNORE INTO revier_eintraege (entry_id) VALUES (?)')
const unmarkStmt = db.prepare('DELETE FROM revier_eintraege WHERE entry_id = ?')
const markedStmt = db.prepare(`SELECT re.entry_id AS id FROM revier_eintraege re JOIN timeline_entries t ON t.id = re.entry_id
  WHERE t.family_id = ? ORDER BY re.entry_id`)

// Dritte Sichtbarkeit einer eigenen Erinnerung. Wirft 404 (nicht eigen), 400 (privat oder Gesundheit).
function setEintragOeffentlich(familyId, entryId, oeffentlich) {
  const entry = ownEntryStmt.get(entryId, familyId)
  if (!entry) throw httpError(404, 'Eintrag nicht gefunden')
  if (!oeffentlich) {
    unmarkStmt.run(entry.id)
    return { id: entry.id, oeffentlich: false, tierImProfil: Boolean(entry.tier_im_profil) }
  }
  if (entry.gesundheit || entry.kategorie === 'tierarzt') throw httpError(400, 'Gesundheit wird nie öffentlich gezeigt.')
  if (entry.privat) throw httpError(400, 'Private Erinnerungen bleiben privat – erst teilen, dann öffentlich zeigen.')
  markStmt.run(entry.id)
  return { id: entry.id, oeffentlich: true, tierImProfil: Boolean(entry.tier_im_profil) }
}

function markedEintraege(familyId) {
  return markedStmt.all(familyId).map((row) => row.id)
}

module.exports = { ensureProfil, einstellungenOf, saveEinstellungen, saveTiere, setEintragOeffentlich, markedEintraege, PLZ_MISSING }

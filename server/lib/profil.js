'use strict'

// Profil: „Euer Name“ (die Person, die gerade angemeldet ist) und das Bild eines Zuhauses bzw. einer Familie.
// - Name: eine Benutzer-Sitzung (users) trägt ihren Namen in user_profil, eine Sitzung mit dem Schlüssel des Zuhauses (oder
//   der Familie beim klassischen Login) in bereich_profil. Dient als Vorgabe für den Autor neuer Erinnerungen und steht im
//   Konto-Menü und in Mitgliederlisten - nie öffentlich.
// - Bild: bereich_profil.bild_file, eine Datei im Upload-Ordner OHNE uploads-Zeile (lässt sich darum weder über /uploads
//   abrufen noch an Tiere/Einträge hängen). Ausgeliefert nur über routes/profil.js GET /:id/bild nach canSeeBild - also
//   dort, wo heute schon der Name des Bereichs zu sehen ist.
// Die Tabellen legt dieses Modul selbst an (Muster lib/visitenkarte.js) - db.js ist an seiner Dateigrenze. ON DELETE CASCADE:
// die Zeilen verschwinden mit dem Zuhause bzw. Benutzer; die Bilddatei räumt lib/families.js deleteFamily mit ab.

const db = require('../db')
const { isVisiting } = require('./visits')

const MAX_NAME_LENGTH = 40
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/
const BILD_ARTS = ['zuhause', 'rudel']

db.exec(`
  CREATE TABLE IF NOT EXISTS bereich_profil (
    family_id INTEGER PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
    anzeigename TEXT,
    bild_file TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS user_profil (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    anzeigename TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const bereichStmt = db.prepare('SELECT anzeigename, bild_file FROM bereich_profil WHERE family_id = ?')
const userStmt = db.prepare('SELECT anzeigename FROM user_profil WHERE user_id = ?')
const setBereichName = db.prepare(`
  INSERT INTO bereich_profil (family_id, anzeigename) VALUES (?, ?)
  ON CONFLICT (family_id) DO UPDATE SET anzeigename = excluded.anzeigename, updated_at = datetime('now')`)
const setUserName = db.prepare(`
  INSERT INTO user_profil (user_id, anzeigename) VALUES (?, ?)
  ON CONFLICT (user_id) DO UPDATE SET anzeigename = excluded.anzeigename, updated_at = datetime('now')`)
const setBildStmt = db.prepare(`
  INSERT INTO bereich_profil (family_id, bild_file) VALUES (?, ?)
  ON CONFLICT (family_id) DO UPDATE SET bild_file = excluded.bild_file, updated_at = datetime('now')`)
const familyStmt = db.prepare('SELECT id, art, is_demo FROM families WHERE id = ?')
// Teilen sich zwei Haushalte eine Familie - oder ist der eine die Familie des anderen (klassischer Login, Mitgliedschaft)?
const relatedStmt = db.prepare(`
  SELECT 1 FROM family_members a JOIN family_members b ON a.group_family_id = b.group_family_id
    WHERE a.member_family_id = @viewer AND b.member_family_id = @target
  UNION ALL SELECT 1 FROM family_members WHERE member_family_id = @viewer AND group_family_id = @target
  UNION ALL SELECT 1 FROM family_members WHERE group_family_id = @viewer AND member_family_id = @target
  LIMIT 1`)

const userNamesStmt = db.prepare(
  `SELECT group_concat(p.anzeigename, ', ') AS namen FROM users u JOIN user_profil p ON p.user_id = u.id
   WHERE u.family_id = ? AND p.anzeigename IS NOT NULL`
)

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Leer (nach dem Trimmen) = Name löschen (null). Wirft 400 bei allem anderen als einem kurzen, einzeiligen Text.
function cleanAnzeigename(value) {
  if (typeof value !== 'string') throw httpError(400, 'Bitte einen Namen angeben')
  const name = value.trim().replace(/\s+/g, ' ')
  if (CONTROL_CHARS.test(value.trim())) throw httpError(400, 'Der Name darf keine Zeilenumbrüche enthalten')
  if (name.length > MAX_NAME_LENGTH) throw httpError(400, `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein`)
  return name || null
}

// Name der angemeldeten Person: Benutzer-Sitzung -> ihr eigener Name, sonst der des Zuhauses (Schlüssel-Sitzung).
function personOf(homeId, userId = null) {
  const anzeigename = userId ? userStmt.get(userId)?.anzeigename : bereichStmt.get(homeId)?.anzeigename
  return { anzeigename: anzeigename || null }
}

function savePersonName(homeId, userId, value) {
  const anzeigename = cleanAnzeigename(value)
  if (userId) setUserName.run(userId, anzeigename)
  else setBereichName.run(homeId, anzeigename)
  return personOf(homeId, userId)
}

// Adresse des Bildes mit kurzer Versionsmarke (neues Bild -> neue Adresse, der Browser darf das alte zwischenspeichern).
function bildUrl(familyId) {
  const file = bereichStmt.get(familyId)?.bild_file
  return file ? `/api/profil/${familyId}/bild?v=${file.slice(0, 8)}` : null
}

const withBild = (area) => (area ? { ...area, bild: bildUrl(area.id) } : area)

function bildFileOf(familyId) {
  return bereichStmt.get(familyId)?.bild_file || null
}

// Setzt (oder mit null: entfernt) das Bild - gibt den bisherigen Dateinamen zurück, den der Aufrufer löscht.
function replaceBild(familyId, filename) {
  const previous = bildFileOf(familyId)
  setBildStmt.run(familyId, filename)
  return previous
}

function canHaveBild(familyId) {
  return BILD_ARTS.includes(familyStmt.get(familyId)?.art)
}

// Darf die Sitzung das Bild von targetId sehen? Eigenes Zuhause, aktiver Bereich, eigene Familien, Haushalte aus
// denselben Familien (Mitgliederliste) und befreundete Zuhause (Besuche, beide Richtungen) - Demo nie mit Nicht-Demo.
function canSeeBild({ homeId, familyId, isAdminView = false }, targetId) {
  if (targetId === homeId || targetId === familyId) return true
  const viewer = familyStmt.get(homeId)
  const target = familyStmt.get(targetId)
  if (!viewer || !target) return false
  if (!isAdminView && Boolean(viewer.is_demo) !== Boolean(target.is_demo)) return false
  if (relatedStmt.get({ viewer: homeId, target: targetId })) return true
  return isVisiting(homeId, targetId) || isVisiting(targetId, homeId)
}

// Für Mitgliederlisten: Name der Person(en) eines Haushalts (der des Zuhauses, sonst die seiner Benutzer) und sein Bild.
function memberProfile(familyId) {
  const anzeigename = bereichStmt.get(familyId)?.anzeigename || userNamesStmt.get(familyId)?.namen || null
  return { anzeigename, bild: bildUrl(familyId) }
}

module.exports = {
  MAX_NAME_LENGTH,
  memberProfile,
  cleanAnzeigename,
  personOf,
  savePersonName,
  bildUrl,
  withBild,
  bildFileOf,
  replaceBild,
  canHaveBild,
  canSeeBild
}

'use strict'

// Einstellungen „Darstellung“ (client/src/components/settings/DarstellungSection.jsx, seit B+ Familienalbum der
// Mini-Designer): Farbwelt, Hintergrund (Papier/Weiß/Dunkel/Automatisch), Schriftgröße, eigene Akzentfarbe, Schriftart,
// Handschrift-Akzente und Ecken. Sie gehören zur Identität (req.homeId - das eigene Zuhause bzw. ein klassisches
// Rudel-Login), nicht zum gerade aktiven Bereich: in einer Familie und zu Besuch gilt die eigene Wahl (lib/context.js buildMe
// liefert sie mit /me aus). Eine Zeile je Identität in home_darstellung - die Tabelle legt dieses Modul selbst an (CREATE
// TABLE IF NOT EXISTS beim ersten require, wie lib/visitenkarte.js) und ergänzt neue Spalten selbst, db.js ist an seiner
// Dateigrenze. ON DELETE CASCADE: die Zeile verschwindet mit dem Zuhause (lib/families.js deleteFamily, foreign_keys ist an).
// Nur Werte aus den festen Listen bzw. eine Farbe #rrggbb - der Client setzt sie als data-Attribute und CSS-Variablen an
// <html> (client/src/lib/darstellung.js), die CSS-Regeln (palettes.css, tokens.css) kennen genau diese.

const db = require('../db')

const PALETTEN = ['familienalbum', 'wald', 'meer', 'lavendel', 'schiefer']
// Vor B+ Familienalbum hieß die Vorgabe „terrakotta“ - gespeicherte Werte und ältere Clients landen bei der neuen.
const LEGACY_PALETTEN = { terrakotta: 'familienalbum' }
const MODI = ['hell', 'weiss', 'dunkel', 'auto']
const SCHRIFTEN = ['normal', 'gross']
const SCHRIFTARTEN = ['klassisch', 'modern', 'lesbar']
const HANDSCHRIFT = ['an', 'aus']
const ECKEN = ['weich', 'eckig']
const HEX_RE = /^#[0-9a-f]{6}$/

const isOneOf = (list) => (value) => list.includes(value)
// Leer = keine eigene Akzentfarbe (die der Farbwelt gilt).
const isAkzent = (value) => value === '' || (typeof value === 'string' && HEX_RE.test(value.toLowerCase()))

const FIELDS = {
  palette: isOneOf(PALETTEN),
  modus: isOneOf(MODI),
  schrift: isOneOf(SCHRIFTEN),
  akzent: isAkzent,
  schriftart: isOneOf(SCHRIFTARTEN),
  handschrift: isOneOf(HANDSCHRIFT),
  ecken: isOneOf(ECKEN)
}
const STANDARD = Object.freeze({
  palette: 'familienalbum',
  modus: 'auto',
  schrift: 'normal',
  akzent: '',
  schriftart: 'klassisch',
  handschrift: 'an',
  ecken: 'weich'
})
const KEYS = Object.keys(FIELDS)

db.exec(`
  CREATE TABLE IF NOT EXISTS home_darstellung (
    family_id INTEGER PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
    palette TEXT NOT NULL,
    modus TEXT NOT NULL,
    schrift TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)
// Mini-Designer (B+ Familienalbum): neue Spalten an bestehende Tabellen anhängen.
const existingColumns = new Set(db.prepare('PRAGMA table_info(home_darstellung)').all().map((column) => column.name))
for (const column of ['akzent', 'schriftart', 'handschrift', 'ecken']) {
  if (!existingColumns.has(column)) {
    db.exec(`ALTER TABLE home_darstellung ADD COLUMN ${column} TEXT NOT NULL DEFAULT '${STANDARD[column]}'`)
  }
}

const findStmt = db.prepare(`SELECT ${KEYS.join(', ')} FROM home_darstellung WHERE family_id = ?`)
const upsertStmt = db.prepare(`
  INSERT INTO home_darstellung (family_id, ${KEYS.join(', ')}, updated_at)
  VALUES (@familyId, ${KEYS.map((key) => `@${key}`).join(', ')}, datetime('now'))
  ON CONFLICT (family_id) DO UPDATE SET
    ${KEYS.map((key) => `${key} = excluded.${key}`).join(', ')}, updated_at = excluded.updated_at`)

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Alte Namen auf die neuen, Farben klein - vor der Prüfung.
function canonical(key, value) {
  if (key === 'palette' && Object.hasOwn(LEGACY_PALETTEN, value)) return LEGACY_PALETTEN[value]
  if (key === 'akzent' && typeof value === 'string') return value.toLowerCase()
  return value
}

// Die ganze Darstellung - ohne gespeicherte Wahl die Vorgabe. Ein Wert, den es nicht (mehr) gibt, fällt einzeln auf die
// Vorgabe zurück, statt einen unbekannten Wert an den Client zu geben.
function loadDarstellung(familyId) {
  const row = findStmt.get(familyId)
  return Object.fromEntries(
    KEYS.map((key) => {
      const value = row ? canonical(key, row[key]) : undefined
      return [key, row && FIELDS[key](value) ? value : STANDARD[key]]
    })
  )
}

// Eine Änderung: ein Objekt mit mindestens einem der Felder, jedes mit einem gültigen Wert - alles andere (unbekannte
// Felder, falsche Typen, leere Änderung) ist ein 400. Gibt nur die geänderten Felder zurück (alte Namen schon umgesetzt).
function validateDarstellung(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'Ungültige Darstellung')
  const keys = Object.keys(input)
  if (keys.length === 0) throw httpError(400, 'Nichts zu ändern')
  if (keys.some((key) => !Object.hasOwn(FIELDS, key))) throw httpError(400, 'Unbekannte Einstellung')
  const values = Object.fromEntries(keys.map((key) => [key, canonical(key, input[key])]))
  const invalid = keys.find((key) => !FIELDS[key](values[key]))
  if (invalid) throw httpError(400, `Ungültiger Wert für „${invalid}“`)
  return values
}

// Prüft die Änderung, legt sie über die bisherige Wahl und speichert alles. Gibt die ganze Darstellung zurück.
function saveDarstellung(familyId, input) {
  const next = { ...loadDarstellung(familyId), ...validateDarstellung(input) }
  upsertStmt.run({ familyId, ...next })
  return next
}

module.exports = {
  PALETTEN,
  MODI,
  SCHRIFTEN,
  SCHRIFTARTEN,
  HANDSCHRIFT,
  ECKEN,
  STANDARD,
  loadDarstellung,
  saveDarstellung,
  validateDarstellung
}

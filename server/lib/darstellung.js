'use strict'

// Einstellungen „Darstellung“ (Calm-down-Runde, client/src/pages/SettingsPage.jsx): Farbpalette, Hell/Dunkel/Automatisch
// und Schriftgröße. Sie gehören zur Identität (req.homeId - das eigene Zuhause bzw. ein klassisches Rudel-Login), nicht
// zum gerade aktiven Bereich: in einer Familie und zu Besuch gilt die eigene Wahl (lib/context.js buildMe liefert sie
// mit /me aus). Eine Zeile je Identität in home_darstellung - die Tabelle legt dieses Modul selbst an (CREATE TABLE IF NOT
// EXISTS beim ersten require, wie lib/visitenkarte.js), db.js ist an seiner Dateigrenze. ON DELETE CASCADE: die Zeile
// verschwindet mit dem Zuhause (lib/families.js deleteFamily, foreign_keys ist an).
// Nur Werte aus den festen Listen - der Client setzt sie als data-Attribute an <html> (client/src/lib/darstellung.js),
// die CSS-Regeln (palettes.css) kennen genau diese.

const db = require('../db')

const PALETTEN = ['terrakotta', 'wald', 'meer', 'lavendel', 'schiefer']
const MODI = ['auto', 'hell', 'dunkel']
const SCHRIFTEN = ['normal', 'gross']
const FIELDS = { palette: PALETTEN, modus: MODI, schrift: SCHRIFTEN }
// Terrakotta sind die Farben beider Auftritte (Familie auf Pfoten und Berner) - die Vorgabe ohne gespeicherte Wahl.
const STANDARD = Object.freeze({ palette: 'terrakotta', modus: 'auto', schrift: 'normal' })

db.exec(`
  CREATE TABLE IF NOT EXISTS home_darstellung (
    family_id INTEGER PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
    palette TEXT NOT NULL,
    modus TEXT NOT NULL,
    schrift TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const findStmt = db.prepare('SELECT palette, modus, schrift FROM home_darstellung WHERE family_id = ?')
const upsertStmt = db.prepare(`
  INSERT INTO home_darstellung (family_id, palette, modus, schrift, updated_at)
  VALUES (@familyId, @palette, @modus, @schrift, datetime('now'))
  ON CONFLICT (family_id) DO UPDATE SET
    palette = excluded.palette, modus = excluded.modus, schrift = excluded.schrift, updated_at = excluded.updated_at`)

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// { palette, modus, schrift } - ohne gespeicherte Wahl die Vorgabe. Ein Wert, den es nicht (mehr) gibt, fällt einzeln
// auf die Vorgabe zurück, statt eine unbekannte Palette an den Client zu geben.
function loadDarstellung(familyId) {
  const row = findStmt.get(familyId)
  return Object.fromEntries(
    Object.entries(FIELDS).map(([key, allowed]) => [key, row && allowed.includes(row[key]) ? row[key] : STANDARD[key]])
  )
}

// Eine Änderung: ein Objekt mit mindestens einem der drei Felder, jedes mit einem Wert aus seiner Liste - alles andere
// (unbekannte Felder, falsche Typen, leere Änderung) ist ein 400. Gibt nur die geänderten Felder zurück.
function validateDarstellung(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'Ungültige Darstellung')
  const keys = Object.keys(input)
  if (keys.length === 0) throw httpError(400, 'Nichts zu ändern')
  if (keys.some((key) => !Object.hasOwn(FIELDS, key))) throw httpError(400, 'Unbekannte Einstellung')
  const invalid = keys.find((key) => !FIELDS[key].includes(input[key]))
  if (invalid) throw httpError(400, `Ungültiger Wert für „${invalid}“`)
  return Object.fromEntries(keys.map((key) => [key, input[key]]))
}

// Prüft die Änderung, legt sie über die bisherige Wahl und speichert alles. Gibt die ganze Darstellung zurück.
function saveDarstellung(familyId, input) {
  const next = { ...loadDarstellung(familyId), ...validateDarstellung(input) }
  upsertStmt.run({ familyId, ...next })
  return next
}

module.exports = { PALETTEN, MODI, SCHRIFTEN, STANDARD, loadDarstellung, saveDarstellung, validateDarstellung }

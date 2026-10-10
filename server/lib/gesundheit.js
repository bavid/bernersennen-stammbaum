'use strict'

// „Gesundheit leicht“ (docs/superpowers/plans/2026-10-10-gesundheit-leicht.md): Impfung, Wurmkur & Floh, Tierarzt oder
// Sonstiges als Art einer Erinnerung, mit optionalem „Nächstes Mal am“ - bewusst keine Krankenakte (keine Werte, keine
// Medikamente; der Text der Erinnerung bleibt frei). Eine Zeile je Erinnerung in gesundheit_eintraege; die Tabelle legt
// dieses Modul selbst an (db.js ist an seiner Dateigrenze, Muster lib/visitenkarte.js). ON DELETE CASCADE: die Angabe
// geht mit der Erinnerung. Geschrieben wird nur über die Timeline (routes/timeline.js - dort sind Eigentum, Rollen und die
// Demo-Sperre schon geprüft), gelesen über routes/gesundheit.js.

const db = require('../db')
const { isIsoDate } = require('./validate')

const ARTEN = Object.freeze(['impfung', 'wurmkur_floh', 'tierarzt', 'sonstiges'])
// „Bald“ auf Start: Termine von heute bis in so vielen Tagen.
const BALD_TAGE = 14

db.exec(`
  CREATE TABLE IF NOT EXISTS gesundheit_eintraege (
    entry_id INTEGER PRIMARY KEY REFERENCES timeline_entries(id) ON DELETE CASCADE,
    art TEXT NOT NULL CHECK (art IN ('impfung', 'wurmkur_floh', 'tierarzt', 'sonstiges')),
    naechstes_am TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_gesundheit_naechstes ON gesundheit_eintraege(naechstes_am);
`)

const hasKey = (body, key) => Object.prototype.hasOwnProperty.call(body, key)
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

// Aus dem Body von POST/PUT /api/timeline: { keep: true } (Feld fehlt - PUT ändert nichts), { value: null } (entfernen)
// oder { value: { art, naechstesAm } } - sonst { error }.
function readGesundheitInput(body) {
  if (!hasKey(body, 'gesundheit')) return { keep: true }
  const input = body.gesundheit
  if (input === null) return { value: null }
  if (!isPlainObject(input) || !ARTEN.includes(input.art)) return { error: 'Unbekannte Art bei Gesundheit' }
  const naechstesAm = input.naechstesAm === undefined || input.naechstesAm === null || input.naechstesAm === '' ? null : input.naechstesAm
  if (naechstesAm !== null && !isIsoDate(naechstesAm)) return { error: '„Nächstes Mal am“ ist ungültig' }
  return { value: { art: input.art, naechstesAm } }
}

// Gesundheit ist persönlich: eine NEUE Gesundheits-Erinnerung im eigenen Zuhause ist privat, wenn der Body nichts
// anderes sagt. In Tierheimen (nie privat) und Familien bleibt es bei der üblichen Vorgabe (0).
function privatVorgabe(body, gesundheit, areaArt) {
  return gesundheit.value && areaArt === 'zuhause' && !hasKey(body, 'privat') ? 1 : 0
}

const upsertStmt = db.prepare(`
  INSERT INTO gesundheit_eintraege (entry_id, art, naechstes_am) VALUES (@entryId, @art, @naechstesAm)
  ON CONFLICT (entry_id) DO UPDATE SET art = excluded.art, naechstes_am = excluded.naechstes_am`)
const deleteStmt = db.prepare('DELETE FROM gesundheit_eintraege WHERE entry_id = ?')

// Innerhalb der Transaktion von routes/timeline.js aufrufen (gesundheit aus readGesundheitInput).
function applyGesundheit(entryId, gesundheit) {
  if (!gesundheit || gesundheit.keep) return
  if (gesundheit.value === null) deleteStmt.run(entryId)
  else upsertStmt.run({ entryId, ...gesundheit.value })
}

// Erinnerungen (mit id) um gesundheit: { art, naechstesAm } | null ergänzen - eine Abfrage für alle.
function withGesundheit(entries) {
  const ids = entries.map((entry) => entry.id).filter(Number.isInteger)
  if (ids.length === 0) return entries
  const rows = db
    .prepare(`SELECT entry_id, art, naechstes_am FROM gesundheit_eintraege WHERE entry_id IN (${ids.map(() => '?').join(', ')})`)
    .all(...ids)
  const byId = new Map(rows.map((row) => [row.entry_id, { art: row.art, naechstesAm: row.naechstes_am }]))
  return entries.map((entry) => ({ ...entry, gesundheit: byId.get(entry.id) || null }))
}

// Je Tier und Art nur die jüngste Erinnerung (Datum, dann Id) - eine neuere Impfung ersetzt den Termin der älteren.
// Nur Erinnerungen, die das Zuhause selbst geschrieben hat, und nur zu eigenen Tieren (Eigentum per JOIN).
const LATEST_SQL = `
  SELECT g.art, g.naechstes_am, t.id AS entry_id, t.datum, t.titel, t.dog_id, d.name AS dog_name, d.bei_uns_bis,
         ROW_NUMBER() OVER (PARTITION BY t.dog_id, g.art ORDER BY t.datum DESC, t.id DESC) AS rang
  FROM gesundheit_eintraege g
  JOIN timeline_entries t ON t.id = g.entry_id
  JOIN dogs d ON d.id = t.dog_id AND d.family_id = @familyId
  WHERE t.family_id = @familyId`

const uebersichtStmt = db.prepare(`SELECT * FROM (${LATEST_SQL} AND t.dog_id = @dogId) WHERE rang = 1`)
const ownDogStmt = db.prepare('SELECT id FROM dogs WHERE id = ? AND family_id = ?')

// Reiter „Infos“: { letzte: [{ art, datum, titel, entryId, naechstesAm }] in der Reihenfolge von ARTEN } - oder null,
// wenn das Tier nicht dem Bereich gehört.
function gesundheitUebersicht(familyId, dogId) {
  if (!ownDogStmt.get(dogId, familyId)) return null
  const rows = uebersichtStmt.all({ familyId, dogId })
  const letzte = ARTEN.map((art) => rows.find((row) => row.art === art))
    .filter(Boolean)
    .map((row) => ({ art: row.art, datum: row.datum, titel: row.titel, entryId: row.entry_id, naechstesAm: row.naechstes_am }))
  return { letzte }
}

const baldStmt = db.prepare(`
  SELECT * FROM (${LATEST_SQL}) WHERE rang = 1 AND bei_uns_bis IS NULL
    AND naechstes_am >= @heute AND naechstes_am <= date(@heute, '+${BALD_TAGE} days')
  ORDER BY naechstes_am, dog_name, art`)

// „Bald“ auf Start: [{ dogId, dogName, art, naechstesAm, entryId }] von heute (Gerätedatum) bis BALD_TAGE Tage weiter.
function gesundheitBald(familyId, heute) {
  return baldStmt.all({ familyId, heute }).map((row) => ({
    dogId: row.dog_id,
    dogName: row.dog_name,
    art: row.art,
    naechstesAm: row.naechstes_am,
    entryId: row.entry_id
  }))
}

module.exports = {
  ARTEN,
  BALD_TAGE,
  readGesundheitInput,
  privatVorgabe,
  applyGesundheit,
  withGesundheit,
  gesundheitUebersicht,
  gesundheitBald
}

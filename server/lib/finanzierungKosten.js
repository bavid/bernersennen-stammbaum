'use strict'

// „Kosten & Reserve“: die laufenden Kosten des Betriebs als Posten („Server 23 €/Monat“, „Domain 12 €/Jahr“) - Tabelle
// finanzierung_kosten, die dieses Modul selbst anlegt (db.js ist an seiner Dateigrenze). Einmalige Kosten stehen weiter je
// Quartal (finanzierung_quartale.kosten_cents, lib/finanzierung.js). Aus beidem rechnet lib/finanzierungVerteilung.js die
// Jahreskosten, den Saldo und die Rücklage „Server-Zukunft“. Der Admin pflegt die Posten (routes/adminFinanzierung.js);
// öffentlich (GET /api/finanzierung) erscheinen nur Titel, Betrag und Intervall - keine Ids, Notizen oder Daten.

const db = require('../db')
const { httpError, assertKnownFields, cleanText, cleanCents, cleanIsoDate } = require('./finanzierungFelder')

db.exec(`
  CREATE TABLE IF NOT EXISTS finanzierung_kosten (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titel TEXT NOT NULL,
    betrag_cents INTEGER NOT NULL,
    intervall TEXT NOT NULL CHECK (intervall IN ('monat','jahr')),
    ab TEXT NOT NULL,
    bis TEXT,
    notiz TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

// Kategorien (Wunsch des Betreibers 10.10.): neutral benannt, gleich für laufende Posten und Vorleistungen
// (lib/finanzierungVorleistung.js) - „Server & Technik“, „Druck & Material (Flyer, Karten)“, „Sonstiges“. Alte Zeilen ohne
// Angabe gelten als Technik (bis dahin gab es nur Server und Domain).
const KATEGORIEN = Object.freeze(['technik', 'druck', 'sonstiges'])
const KATEGORIE_COLUMN = 'kategorie'
if (!db.prepare('PRAGMA table_info(finanzierung_kosten)').all().some((column) => column.name === KATEGORIE_COLUMN)) {
  db.exec(`ALTER TABLE finanzierung_kosten ADD COLUMN ${KATEGORIE_COLUMN} TEXT NOT NULL DEFAULT 'technik'`)
}

const KOSTEN_LIMITS = Object.freeze({ titel: 80, notiz: 200 })
const INTERVALLE = Object.freeze(['monat', 'jahr'])
const KOSTEN_FIELDS = Object.freeze(['titel', 'betragCents', 'intervall', 'kategorie', 'ab', 'bis', 'notiz'])

// Fehlend = Vorgabe (ältere Formulare kennen das Feld nicht).
function cleanKategorie(value, fallback = 'technik') {
  if (value === undefined || value === null || value === '') return fallback
  if (!KATEGORIEN.includes(value)) throw httpError(400, 'Bitte eine Kategorie wählen.', 'kategorie')
  return value
}

function cleanIntervall(value) {
  if (!INTERVALLE.includes(value)) throw httpError(400, 'Das Intervall muss Monat oder Jahr sein.', 'intervall')
  return value
}

// Ein Posten als Spalten (snake_case) für INSERT/UPDATE.
function validateKosten(body) {
  assertKnownFields(body, KOSTEN_FIELDS)
  const titel = cleanText(body.titel, { feld: 'titel', label: 'Der Titel', max: KOSTEN_LIMITS.titel })
  if (!titel) throw httpError(400, 'Bitte gib dem Posten einen Titel.', 'titel')
  const ab = cleanIsoDate(body.ab, { feld: 'ab', label: 'Der Beginn', required: true })
  const bis = cleanIsoDate(body.bis, { feld: 'bis', label: 'Das Ende' })
  if (bis && bis < ab) throw httpError(400, 'Das Ende muss nach dem Beginn liegen.', 'bis')
  return {
    titel,
    betrag_cents: cleanCents(body.betragCents, { feld: 'betragCents', label: 'Der Betrag', required: true, min: 1 }),
    intervall: cleanIntervall(body.intervall),
    kategorie: cleanKategorie(body.kategorie),
    ab,
    bis,
    notiz: cleanText(body.notiz, { feld: 'notiz', label: 'Die Notiz', max: KOSTEN_LIMITS.notiz }) || null
  }
}

const listStmt = db.prepare('SELECT * FROM finanzierung_kosten ORDER BY ab, id')
const findStmt = db.prepare('SELECT * FROM finanzierung_kosten WHERE id = ?')
const insertStmt = db.prepare(`
  INSERT INTO finanzierung_kosten (titel, betrag_cents, intervall, kategorie, ab, bis, notiz)
  VALUES (@titel, @betrag_cents, @intervall, @kategorie, @ab, @bis, @notiz)`)
const updateStmt = db.prepare(`
  UPDATE finanzierung_kosten
  SET titel = @titel, betrag_cents = @betrag_cents, intervall = @intervall, kategorie = @kategorie, ab = @ab, bis = @bis, notiz = @notiz, updated_at = datetime('now')
  WHERE id = @id`)
const deleteStmt = db.prepare('DELETE FROM finanzierung_kosten WHERE id = ?')

// Für die Rechnung (lib/finanzierungVerteilung.js) und den Admin: alle Felder in camelCase.
function adminPosten(row) {
  return {
    id: row.id,
    titel: row.titel,
    betragCents: row.betrag_cents,
    intervall: row.intervall,
    kategorie: row.kategorie,
    ab: row.ab,
    bis: row.bis,
    notiz: row.notiz,
    updatedAt: row.updated_at
  }
}

// Öffentlich: nur, was die Seite nennt.
function publicPosten(posten) {
  return { titel: posten.titel, betragCents: posten.betragCents, intervall: posten.intervall, kategorie: posten.kategorie }
}

function listKosten() {
  return listStmt.all().map(adminPosten)
}

function createKosten(body) {
  const row = validateKosten(body)
  const id = insertStmt.run(row).lastInsertRowid
  return adminPosten(findStmt.get(id))
}

// null, wenn es die Id nicht gibt.
function updateKosten(id, body) {
  if (!findStmt.get(id)) return null
  const row = validateKosten(body)
  updateStmt.run({ ...row, id })
  return adminPosten(findStmt.get(id))
}

// true, wenn es etwas zu löschen gab.
function deleteKosten(id) {
  return deleteStmt.run(id).changes > 0
}

module.exports = { KOSTEN_LIMITS, INTERVALLE, KATEGORIEN, cleanKategorie, validateKosten, listKosten, createKosten, updateKosten, deleteKosten, publicPosten }

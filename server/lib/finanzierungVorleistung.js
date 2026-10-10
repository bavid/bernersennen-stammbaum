'use strict'

// „Anschub“ (Vorleistung): einmalige Kosten, die der Betreiber privat vorgestreckt hat (z. B. Druck & Material für Flyer
// und Karten) und die nach und nach aus Spenden gedeckt werden sollen - Tabelle finanzierung_vorleistungen, die dieses
// Modul selbst anlegt (db.js ist an seiner Dateigrenze). Der Admin trägt Betrag, Kategorie und Datum ein
// (routes/adminFinanzierung.js). Wie viel davon schon gedeckt ist, wird nie gespeichert, sondern in
// lib/finanzierungVerteilung.js aus den Quartalen berechnet (Reihenfolge dort im Kopf). Öffentlich erscheinen nur Titel,
// Kategorie, Betrag, Datum und der gedeckte Teil - keine Ids oder Notizen.

const db = require('../db')
const { httpError, assertKnownFields, cleanText, cleanCents, cleanIsoDate } = require('./finanzierungFelder')
const { KATEGORIEN } = require('./finanzierungKosten')

db.exec(`
  CREATE TABLE IF NOT EXISTS finanzierung_vorleistungen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titel TEXT NOT NULL,
    kategorie TEXT NOT NULL,
    betrag_cents INTEGER NOT NULL CHECK (betrag_cents > 0),
    datum TEXT NOT NULL,
    notiz TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const VORLEISTUNG_LIMITS = Object.freeze({ titel: 80, notiz: 200 })
const VORLEISTUNG_FIELDS = Object.freeze(['titel', 'kategorie', 'betragCents', 'datum', 'notiz'])

function validateVorleistung(body) {
  assertKnownFields(body, VORLEISTUNG_FIELDS)
  const titel = cleanText(body.titel, { feld: 'titel', label: 'Der Titel', max: VORLEISTUNG_LIMITS.titel }) || 'Anschub'
  if (!KATEGORIEN.includes(body.kategorie)) throw httpError(400, 'Bitte eine Kategorie wählen.', 'kategorie')
  return {
    titel,
    kategorie: body.kategorie,
    betrag_cents: cleanCents(body.betragCents, { feld: 'betragCents', label: 'Der Betrag', required: true, min: 1 }),
    datum: cleanIsoDate(body.datum, { feld: 'datum', label: 'Das Datum', required: true }),
    notiz: cleanText(body.notiz, { feld: 'notiz', label: 'Die Notiz', max: VORLEISTUNG_LIMITS.notiz }) || null
  }
}

const listStmt = db.prepare('SELECT * FROM finanzierung_vorleistungen ORDER BY datum, id')
const findStmt = db.prepare('SELECT * FROM finanzierung_vorleistungen WHERE id = ?')
const insertStmt = db.prepare(`
  INSERT INTO finanzierung_vorleistungen (titel, kategorie, betrag_cents, datum, notiz)
  VALUES (@titel, @kategorie, @betrag_cents, @datum, @notiz)`)
const updateStmt = db.prepare(`
  UPDATE finanzierung_vorleistungen
  SET titel = @titel, kategorie = @kategorie, betrag_cents = @betrag_cents, datum = @datum, notiz = @notiz, updated_at = datetime('now')
  WHERE id = @id`)
const deleteStmt = db.prepare('DELETE FROM finanzierung_vorleistungen WHERE id = ?')

function adminVorleistung(row) {
  return { id: row.id, titel: row.titel, kategorie: row.kategorie, betragCents: row.betrag_cents, datum: row.datum, notiz: row.notiz }
}

// Chronologisch (älteste zuerst) - in dieser Reihenfolge werden sie gedeckt.
function listVorleistungen() {
  return listStmt.all().map(adminVorleistung)
}

function createVorleistung(body) {
  const id = insertStmt.run(validateVorleistung(body)).lastInsertRowid
  return adminVorleistung(findStmt.get(id))
}

function updateVorleistung(id, body) {
  if (!findStmt.get(id)) return null
  updateStmt.run({ ...validateVorleistung(body), id })
  return adminVorleistung(findStmt.get(id))
}

function deleteVorleistung(id) {
  return deleteStmt.run(id).changes > 0
}

module.exports = { VORLEISTUNG_LIMITS, validateVorleistung, listVorleistungen, createVorleistung, updateVorleistung, deleteVorleistung }

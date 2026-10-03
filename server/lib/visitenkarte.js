'use strict'

// Phase V5: die gespeicherte Visitenkarten-Gestaltung eines Partners (routes/partnerArea/visitenkarte.js). Eine Zeile je
// Partner in partner_visitenkarte, design als JSON (geprüft in lib/visitenkarteDesign.js validateDesign). Die Tabelle
// legt dieses Modul selbst an (CREATE TABLE IF NOT EXISTS beim ersten require, wie lib/serverHistory.js) - db.js ist an
// seiner Dateigrenze. Bewusst ohne REFERENCES auf partners(id) - wie partner_einblicke; is_demo markiert die Gestaltungen
// des Demo-Packs (lib/demoPartnerAreas.js räumt sie beim Erneuern weg).

const db = require('../db')
const { storedDesign, validateDesign } = require('./visitenkarteDesign')

db.exec(`
  CREATE TABLE IF NOT EXISTS partner_visitenkarte (
    partner_id INTEGER PRIMARY KEY,
    design TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const findStmt = db.prepare('SELECT design FROM partner_visitenkarte WHERE partner_id = ?')
const upsertStmt = db.prepare(`
  INSERT INTO partner_visitenkarte (partner_id, design, is_demo, updated_at)
  VALUES (@partnerId, @design, @isDemo, datetime('now'))
  ON CONFLICT (partner_id) DO UPDATE SET design = excluded.design, is_demo = excluded.is_demo, updated_at = excluded.updated_at`)

// { design, gespeichert } - ohne gespeicherte Gestaltung die Vorgabe aus dem Profil (gespeichert: false).
function loadDesign(partner) {
  const row = findStmt.get(partner.id)
  return { design: storedDesign(row?.design, partner), gespeichert: Boolean(row) }
}

// Prüft und speichert die ganze Gestaltung (400 bei ungültigen Angaben, lib/visitenkarteDesign.js). Gibt sie gesäubert
// zurück. is_demo folgt dem Partner.
function saveDesign(partner, input) {
  const design = validateDesign(input)
  upsertStmt.run({ partnerId: partner.id, design: JSON.stringify(design), isDemo: partner.is_demo ? 1 : 0 })
  return design
}

// Demo-Pack: die Gestaltungen der Demo-Partner (is_demo = 1) und der Partner des letzten Laufs (previousPartnerIds -
// die werden gleich gelöscht) wegräumen.
function removeDemoVisitenkarten(previousPartnerIds = []) {
  const placeholders = previousPartnerIds.map(() => '?').join(', ')
  const where = previousPartnerIds.length ? `is_demo = 1 OR partner_id IN (${placeholders})` : 'is_demo = 1'
  db.prepare(`DELETE FROM partner_visitenkarte WHERE ${where}`).run(...previousPartnerIds)
}

module.exports = { loadDesign, saveDesign, removeDemoVisitenkarten }

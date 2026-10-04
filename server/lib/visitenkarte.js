'use strict'

// Phase V5, Feedback-Runde: die gespeicherte Karten-Gestaltung eines Partners (routes/partnerArea/visitenkarte.js) - EINE
// Vorderseite für alle Kombinationen und die gewählte Kombination (lib/visitenkarteDesign.js). Eine Zeile je Partner in
// partner_visitenkarte, design als JSON. Die Tabelle legt dieses Modul selbst an (CREATE TABLE IF NOT EXISTS beim ersten
// require, wie lib/serverHistory.js) - db.js ist an seiner Dateigrenze. Bewusst ohne REFERENCES auf partners(id) - wie
// partner_einblicke; is_demo markiert die Gestaltungen des Demo-Packs (lib/demoPartnerAreas.js räumt sie beim Erneuern
// weg). Frühere getrennte Gestaltungen (Visitenkarte hier, Einladungskarte in lib/einladungskarte.js) werden beim Lesen
// zusammengeführt und beim nächsten Speichern ersetzt.

const db = require('../db')
const { storedDesign, validateDesign } = require('./visitenkarteDesign')
const { readLegacyEinladung, removeLegacyEinladung } = require('./einladungskarte')

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
  const legacyEinladung = readLegacyEinladung(partner.id)
  return { design: storedDesign(row?.design, partner, legacyEinladung), gespeichert: Boolean(row || legacyEinladung) }
}

// Speichern ersetzt beides: die neue Gestaltung steht hier, die frühere Einladungskarte fällt weg.
const saveTransaction = db.transaction((partner, design) => {
  upsertStmt.run({ partnerId: partner.id, design: JSON.stringify(design), isDemo: partner.is_demo ? 1 : 0 })
  removeLegacyEinladung(partner.id)
})

// Prüft und speichert die ganze Gestaltung (400 bei ungültigen Angaben, lib/visitenkarteDesign.js). Gibt sie gesäubert
// zurück. is_demo folgt dem Partner.
function saveDesign(partner, input) {
  const design = validateDesign(input)
  saveTransaction(partner, design)
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

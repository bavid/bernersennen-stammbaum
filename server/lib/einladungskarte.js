'use strict'

// Einladungskarten: die gespeicherte Gestaltung der Vorderseite eines Partners (routes/partnerArea/visitenkarte.js) -
// getrennt von seiner Visitenkarte (lib/visitenkarte.js), eine Zeile je Partner in partner_einladungskarte, design als
// JSON (geprüft in lib/einladungskarteDesign.js). Die Rückseite gestaltet Familie auf Pfoten (lib/einladungRueckseite.js),
// die Codes kommen aus demselben Abruf wie bei den Visitenkarten (lib/visitenkarteGutscheine.js). Die Tabelle legt dieses
// Modul selbst an (wie lib/visitenkarte.js - db.js ist an seiner Dateigrenze), bewusst ohne REFERENCES auf partners(id);
// is_demo markiert die Gestaltungen des Demo-Packs (lib/demoPartnerAreas.js räumt sie beim Erneuern weg).

const db = require('../db')
const { storedEinladungDesign, validateEinladungDesign } = require('./einladungskarteDesign')

db.exec(`
  CREATE TABLE IF NOT EXISTS partner_einladungskarte (
    partner_id INTEGER PRIMARY KEY,
    design TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const findStmt = db.prepare('SELECT design FROM partner_einladungskarte WHERE partner_id = ?')
const upsertStmt = db.prepare(`
  INSERT INTO partner_einladungskarte (partner_id, design, is_demo, updated_at)
  VALUES (@partnerId, @design, @isDemo, datetime('now'))
  ON CONFLICT (partner_id) DO UPDATE SET design = excluded.design, is_demo = excluded.is_demo, updated_at = excluded.updated_at`)

// { design, gespeichert } - ohne gespeicherte Gestaltung die Vorgabe: der Look der Visitenkarte (visitenkarte: deren
// gespeicherte Gestaltung oder null), sonst das Profil.
function loadEinladung(partner, visitenkarte = null) {
  const row = findStmt.get(partner.id)
  return { design: storedEinladungDesign(row?.design, partner, visitenkarte), gespeichert: Boolean(row) }
}

// Prüft und speichert die ganze Gestaltung (400 bei ungültigen Angaben). Gibt sie gesäubert zurück; is_demo folgt dem
// Partner.
function saveEinladung(partner, input) {
  const design = validateEinladungDesign(input)
  upsertStmt.run({ partnerId: partner.id, design: JSON.stringify(design), isDemo: partner.is_demo ? 1 : 0 })
  return design
}

// Demo-Pack: die Gestaltungen der Demo-Partner (is_demo = 1) und der Partner des letzten Laufs wegräumen.
function removeDemoEinladungskarten(previousPartnerIds = []) {
  const placeholders = previousPartnerIds.map(() => '?').join(', ')
  const where = previousPartnerIds.length ? `is_demo = 1 OR partner_id IN (${placeholders})` : 'is_demo = 1'
  db.prepare(`DELETE FROM partner_einladungskarte WHERE ${where}`).run(...previousPartnerIds)
}

module.exports = { loadEinladung, saveEinladung, removeDemoEinladungskarten }

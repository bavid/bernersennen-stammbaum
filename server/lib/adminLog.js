'use strict'

const db = require('../db')

// Phase 5 Task 5b: Protokoll der Admin-Aktionen (Tabelle admin_log, db.js). Aktionen: 'view' - der Admin hat
// einen Bereich in der Admin-Ansicht geöffnet (routes/admin.js POST /view/:familyId), ziel 'family:<id>';
// 'gutschein-zugewiesen' (Phase N Task 1) - einer Anfrage wurde ein Gutschein zugewiesen
// (routes/adminAnfragen.js), ziel 'anfrage:<id>'. ziel benennt nur das Objekt, nie Namen, Inhalte oder Codes.
const AKTION = Object.freeze({ view: 'view', gutscheinZugewiesen: 'gutschein-zugewiesen' })

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const insertStmt = db.prepare('INSERT INTO admin_log (aktion, ziel) VALUES (?, ?)')
const recentStmt = db.prepare('SELECT id, aktion, ziel, created_at FROM admin_log ORDER BY created_at DESC, id DESC LIMIT ?')

function familyZiel(familyId) {
  return `family:${familyId}`
}

function anfrageZiel(anfrageId) {
  return `anfrage:${anfrageId}`
}

function logAdminAction(aktion, ziel) {
  insertStmt.run(aktion, ziel)
}

// ?limit= aus der Query: nur eine positive Ganzzahl zählt, gedeckelt auf MAX_LIMIT; alles andere (fehlend,
// 0, Text) ergibt DEFAULT_LIMIT.
function cleanLimit(value) {
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit <= 0) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

function recentAdminLog(limit) {
  return recentStmt.all(cleanLimit(limit))
}

module.exports = { AKTION, DEFAULT_LIMIT, MAX_LIMIT, familyZiel, anfrageZiel, logAdminAction, cleanLimit, recentAdminLog }

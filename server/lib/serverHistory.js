'use strict'

// Phase G Task 6, Admin-Reiter „Server“: stündliche Messwerte für den Verlauf (Speicher, Platte, Last) und die Regel
// „dauerhaft“ der Warnungen (lib/serverWarnings.js), RETENTION_DAYS lang. Keine personenbezogenen Daten. Die Tabelle legt
// dieses Modul selbst an (CREATE TABLE IF NOT EXISTS beim ersten require, wie db.js) - db.js ist an seiner Dateigrenze.
// at: ISO-Zeit in UTC (vergleicht als Text richtig). Neustarts innerhalb einer Stunde legen keine zusätzliche Messung an
// (MIN_GAP_MS), damit „die letzten drei Messungen“ wirklich drei Stunden umfassen.

const db = require('../db')

const RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const MIN_GAP_MS = 50 * 60 * 1000
// Obergrenze der Antwort: 30 Tage stündlich sind 720 Zeilen, mit Neustarts höchstens etwa 870.
const MAX_LIST = 1000

db.exec(`
  CREATE TABLE IF NOT EXISTS server_messwerte (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    mem_used_pct REAL,
    disk_used_pct REAL,
    load1 REAL,
    load5 REAL,
    app_rss INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_server_messwerte_at ON server_messwerte(at);
`)

const COLUMNS = 'at, mem_used_pct, disk_used_pct, load1, load5, app_rss'
const newestStmt = db.prepare('SELECT at FROM server_messwerte ORDER BY at DESC LIMIT 1')
const insertStmt = db.prepare(
  `INSERT INTO server_messwerte (${COLUMNS}) VALUES (@at, @mem_used_pct, @disk_used_pct, @load1, @load5, @app_rss)`
)
const purgeStmt = db.prepare('DELETE FROM server_messwerte WHERE at < ?')
const listStmt = db.prepare(`SELECT ${COLUMNS} FROM (SELECT ${COLUMNS} FROM server_messwerte WHERE at >= ? ORDER BY at DESC LIMIT ${MAX_LIST}) ORDER BY at ASC`)
const recentStmt = db.prepare(`SELECT ${COLUMNS} FROM server_messwerte ORDER BY at DESC LIMIT ?`)

const iso = (ms) => new Date(ms).toISOString()
const finiteOrNull = (value) => (Number.isFinite(value) ? value : null)

function cutoff(now) {
  return iso(now - RETENTION_DAYS * DAY_MS)
}

// Speichert eine Messung { mem_used_pct, disk_used_pct, load1, load5, app_rss } (fehlende Werte NULL) - außer, die letzte
// ist jünger als MIN_GAP_MS. Eine Zeile aus der Zukunft (Uhr war verstellt) hält die Messungen nicht auf. true, wenn
// gespeichert.
function recordSample(sample, { now = Date.now() } = {}) {
  const newest = newestStmt.get()
  const age = newest ? now - Date.parse(newest.at) : Infinity
  if (age >= 0 && age < MIN_GAP_MS) return false
  insertStmt.run({
    at: iso(now),
    mem_used_pct: finiteOrNull(sample.mem_used_pct),
    disk_used_pct: finiteOrNull(sample.disk_used_pct),
    load1: finiteOrNull(sample.load1),
    load5: finiteOrNull(sample.load5),
    app_rss: Number.isSafeInteger(sample.app_rss) ? sample.app_rss : null
  })
  return true
}

// Löscht Messungen älter als RETENTION_DAYS; gibt die Anzahl zurück.
function purgeSamples({ now = Date.now() } = {}) {
  return purgeStmt.run(cutoff(now)).changes
}

// Verlauf der letzten RETENTION_DAYS, älteste zuerst.
function listSamples({ now = Date.now() } = {}) {
  return listStmt.all(cutoff(now))
}

// Die neuesten `limit` Messungen, neueste zuerst.
function recentSamples(limit) {
  return recentStmt.all(limit)
}

module.exports = { RETENTION_DAYS, MIN_GAP_MS, recordSample, purgeSamples, listSamples, recentSamples }

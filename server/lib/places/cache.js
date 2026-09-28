'use strict'

// Cache und Tages-Budgets für die Umkreissuche (Task 3; security-review Phase 2 Findings 3/4/10) - siehe
// server/db.js (places_cache, places_budget) und docs/superpowers/plans/2026-09-28-phase-2-partner.md.

const CACHE_TTL_DAYS = 7
const CACHE_STEP = 0.05 // Grad - siehe Plan: Schlüssel rundet gröber als die Standort-Rundung (0,01°)

// Fallback-Obergrenze für echte Overpass-Anfragen PRO IDENTITÄT (homeId) und Kalendertag, zusätzlich
// zum globalen Tages-Budget (places_budget) - schützt davor, dass eine einzelne Identität das
// gemeinsame Budget allein aufbraucht (Finding 10). Liegt bewusst NICHT in server/config.js (das wird
// gerade parallel von einem anderen Team-Mitglied bearbeitet), sondern liest ihre eigene, optionale
// Umgebungsvariable direkt.
const DEFAULT_IDENTITY_DAILY_LIMIT = 50

function roundToStep(value, step) {
  return Math.round(value / step) * step
}

// Rundet auf die 0,05°-Zell-Mitte, als "saubere" Zahl (kein 52.550000000000004 durch Gleitkomma-
// Ungenauigkeit) - wird sowohl für den Cache-Schlüssel als auch als tatsächlicher Overpass-Anfrage-
// Mittelpunkt verwendet (siehe lib/places/index.js).
function cellCenter(lat, lon) {
  return {
    lat: Number(roundToStep(lat, CACHE_STEP).toFixed(2)),
    lon: Number(roundToStep(lon, CACHE_STEP).toFixed(2))
  }
}

// Schlüssel: ${kind}:${lat auf 0,05°}:${lon auf 0,05°}:${radius} - kind unterscheidet den Anbieter
// (aktuell nur 'overpass'; 'fixture' braucht keinen Cache, da nie extern angefragt wird). `radiusKm` ist
// die vom Menschen angefragte Zahl (5/10/25/50/100), nicht der tatsächlich bei Overpass abgefragte,
// gepolsterte Radius (siehe index.js) - zwei Suchen mit unterschiedlichem Radius bleiben so getrennt.
function cacheKey(kind, lat, lon, radiusKm) {
  const cell = cellCenter(lat, lon)
  return `${kind}:${cell.lat.toFixed(2)}:${cell.lon.toFixed(2)}:${radiusKm}`
}

// Löscht abgelaufene Einträge - wird sowohl beim Schreiben als auch beim Lesen aufgerufen (Finding 10:
// "purge expired places_cache rows on read"), damit sich die Tabelle nicht unbegrenzt mit Leichen füllt,
// auch wenn lange niemand mehr schreibt.
function purgeExpiredCache(db) {
  db.prepare(`DELETE FROM places_cache WHERE created_at <= datetime('now', ?)`).run(`-${CACHE_TTL_DAYS} days`)
}

function readCache(db, key) {
  purgeExpiredCache(db)
  const row = db.prepare('SELECT payload FROM places_cache WHERE key = ?').get(key)
  return row ? JSON.parse(row.payload) : null
}

function writeCache(db, key, payload) {
  purgeExpiredCache(db)
  db.prepare(`INSERT INTO places_cache (key, payload, created_at) VALUES (?, ?, datetime('now'))
              ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at`).run(key, JSON.stringify(payload))
}

// Höchstens `dailyLimit` echte Overpass-Anfragen pro Kalendertag (UTC) - darüber liefert die Suche nur
// noch Cache und Partner, dazu limited: true (siehe lib/places/index.js). Eine Transaktion macht das
// Lesen+Erhöhen atomar, auch bei gleichzeitigen Anfragen.
function consumeOverpassBudget(db, dailyLimit) {
  const day = new Date().toISOString().slice(0, 10)
  return db.transaction(() => {
    db.prepare('INSERT INTO places_budget (day, count) VALUES (?, 0) ON CONFLICT(day) DO NOTHING').run(day)
    const { count } = db.prepare('SELECT count FROM places_budget WHERE day = ?').get(day)
    if (count >= dailyLimit) return false
    db.prepare('UPDATE places_budget SET count = count + 1 WHERE day = ?').run(day)
    return true
  })()
}

// Pro-Identität-Budget (Finding 10) - bewusst nur im Prozessspeicher (kein eigener DB-Table nötig, der
// Vorgabe erlaubt ausdrücklich "eine kleine Tabelle ODER eine In-Memory-Map"): ein Neustart setzt die
// Zählung zurück, das ist für eine reine Fairness-Bremse unkritisch. `identityBudgetDay` verhindert
// unbegrenztes Wachstum der Map über viele Tage hinweg - bei Tageswechsel wird sie einfach geleert.
let identityBudgetDay = null
let identityBudgetCounts = new Map() // homeId -> count (für identityBudgetDay)

function identityDailyLimit() {
  const raw = Number(process.env.PLACES_DAILY_LIMIT_PER_IDENTITY)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_IDENTITY_DAILY_LIMIT
}

// Ohne Identität (z. B. interne Aufrufe/Tests direkt gegen lib/places) nicht einschränken - nur echte,
// eingeloggte Anfragen (req.homeId aus requireSession) zählen gegen die Quote.
function consumeIdentityBudget(homeId, dailyLimit = identityDailyLimit()) {
  if (!homeId) return true

  const day = new Date().toISOString().slice(0, 10)
  if (day !== identityBudgetDay) {
    identityBudgetDay = day
    identityBudgetCounts = new Map()
  }

  const count = identityBudgetCounts.get(homeId) || 0
  if (count >= dailyLimit) return false
  identityBudgetCounts.set(homeId, count + 1)
  return true
}

module.exports = {
  cacheKey,
  cellCenter,
  readCache,
  writeCache,
  purgeExpiredCache,
  consumeOverpassBudget,
  consumeIdentityBudget,
  CACHE_TTL_DAYS,
  CACHE_STEP
}

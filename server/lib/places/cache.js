'use strict'

// Cache und Tages-Budget für die Umkreissuche (Task 3) - siehe server/db.js (places_cache,
// places_budget) und docs/superpowers/plans/2026-09-28-phase-2-partner.md.

const CACHE_TTL_DAYS = 7
const CACHE_STEP = 0.05 // Grad - siehe Plan: Schlüssel rundet gröber als die Standort-Rundung (0,01°)

function roundToStep(value, step) {
  return Math.round(value / step) * step
}

// Schlüssel: ${kind}:${lat auf 0,05°}:${lon auf 0,05°}:${radius} - kind unterscheidet den Anbieter
// (aktuell nur 'overpass'; 'fixture' braucht keinen Cache, da nie extern angefragt wird).
function cacheKey(kind, lat, lon, radiusKm) {
  return `${kind}:${roundToStep(lat, CACHE_STEP).toFixed(2)}:${roundToStep(lon, CACHE_STEP).toFixed(2)}:${radiusKm}`
}

function readCache(db, key) {
  const row = db.prepare(`SELECT payload FROM places_cache WHERE key = ? AND created_at > datetime('now', ?)`).get(key, `-${CACHE_TTL_DAYS} days`)
  return row ? JSON.parse(row.payload) : null
}

// Räumt beim Schreiben abgelaufene Einträge weg (siehe Plan) und legt/ersetzt den eigenen Schlüssel.
function writeCache(db, key, payload) {
  db.prepare(`DELETE FROM places_cache WHERE created_at <= datetime('now', ?)`).run(`-${CACHE_TTL_DAYS} days`)
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

module.exports = { cacheKey, readCache, writeCache, consumeOverpassBudget, CACHE_TTL_DAYS, CACHE_STEP }

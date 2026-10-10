'use strict'

// Instanz-Modus „rudel“ (config.instanzModus, env INSTANZ_MODUS=rudel): eine Instanz nur für ein bestehendes Rudel, das
// sich mit dem gemeinsamen Familien-Passwort anmeldet. Der Client zeigt dort nur den Passwort-Login (GET /api/config
// meldet den Modus); als zweite Verteidigungslinie lehnt der Server hier alles ab, was neue Bereiche oder Konten
// erzeugt oder in die Demo führt: Gutscheine prüfen/einlösen/übernehmen, Demo-Login, öffentliche Gutschein- und
// Partner-Anfragen, Familie beitreten/gründen. Antwort 404 wie für unbekannte Pfade - die Instanz verrät nicht, was es
// woanders gäbe. Normale Instanzen (leerer Modus) laufen unverändert durch.

const config = require('../config')

const MODUS = Object.freeze({ normal: '', rudel: 'rudel' })

// Pfade relativ zu /api (so sieht sie die Middleware, eingehängt unter /api in app.js), je mit Methode.
const GESPERRT_IM_RUDEL = Object.freeze([
  ['POST', '/demo'],
  ['POST', '/vouchers/check'],
  ['POST', '/vouchers/redeem'],
  ['POST', '/vouchers/claim'],
  ['POST', '/public/anfragen'],
  ['POST', '/families/join'],
  ['POST', '/families/group']
])

function normalizePath(p) {
  const ohneSlash = (p || '').replace(/\/+$/, '')
  return (ohneSlash || '/').toLowerCase()
}

function isGesperrt(method, apiPath) {
  const pfad = normalizePath(apiPath)
  return GESPERRT_IM_RUDEL.some(([m, p]) => m === method && p === pfad)
}

function isRudelInstanz(modus = config.instanzModus) {
  return modus === MODUS.rudel
}

// modus als Parameter nur für Tests - sonst gilt config.instanzModus.
function createInstanzSperre(modus = config.instanzModus) {
  return function instanzSperre(req, res, next) {
    if (!isRudelInstanz(modus) || !isGesperrt(req.method, req.path)) return next()
    res.status(404).json({ error: 'Nicht gefunden' })
  }
}

module.exports = { MODUS, GESPERRT_IM_RUDEL, isGesperrt, isRudelInstanz, createInstanzSperre }

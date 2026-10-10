'use strict'

// „Es gibt eine neue Version“ der Rudel-Instanz (lib/instanzModus.js): Der Link kommt aus dem Hinweis, den
// scripts/migriere-rudel-instanz.js anlegt (lib/rudelMigration.js, Titel unten). GET /api/config gibt ihn als
// neueVersionUrl heraus - nur im Rudel-Modus und nur, solange der Hinweis aktiv ist. Der Client zeigt damit die Karte
// auf Anmeldung und Start (components/rudel/NeueVersionKarte.jsx) und blendet den gleichen Hinweis im Band aus.

const db = require('../db')
const config = require('../config')
const { isRudelInstanz } = require('./instanzModus')

const NEUE_VERSION_TITEL = 'Neue Familie auf Pfoten'

function neueVersionUrl(modus = config.instanzModus) {
  if (!isRudelInstanz(modus)) return null
  const row = db
    .prepare(
      `SELECT link_url FROM hinweise
        WHERE titel = ? AND is_demo = 0 AND aktiv = 1 AND link_url IS NOT NULL AND link_url != ''
        ORDER BY id LIMIT 1`
    )
    .get(NEUE_VERSION_TITEL)
  return row?.link_url || null
}

module.exports = { NEUE_VERSION_TITEL, neueVersionUrl }

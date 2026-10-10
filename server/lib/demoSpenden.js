'use strict'

// „Spenden live“ in der Demo: ein paar Demo-Spenden (is_demo = 1), damit die Vorschau den Block auf /finanzierung zeigt.
// Läuft innerhalb der replaceDemoPack-Transaktion (lib/demoPack.js): räumt NUR is_demo = 1 weg und legt neu an - echte
// Spenden bleiben unberührt. Zeiten relativ zu jetzt (Stunden zurück), damit „vor 2 Stunden“ immer stimmt. Gezeigt werden
// sie nur, solange es keine echten Spenden gibt und die Demo-Regel es erlaubt (lib/spendenLive.js) - in keiner Summe der
// Rechnung oder des Laufbands.

require('./spenden') // legt spenden_eingaenge an
const { heuteIso } = require('./spenden')

const DEMO_SPENDEN = Object.freeze([
  { stundenHer: 2, betragCents: 2000, quelle: 'gofundme', anzeigename: null, nachricht: 'Für die Fellnasen!' },
  { stundenHer: 20, betragCents: 1500, quelle: 'paypal', anzeigename: 'Familie von Benno', nachricht: 'Danke für das schöne Album.' },
  { stundenHer: 50, betragCents: 5000, quelle: 'ueberweisung', anzeigename: 'Lotte & Pepper', nachricht: null },
  { stundenHer: 100, betragCents: 1000, quelle: 'bar', anzeigename: null, nachricht: null, oeffentlich: 0 },
  { stundenHer: 170, betragCents: 2500, quelle: 'gofundme', anzeigename: 'Wilma', nachricht: 'Weiter so!' },
  { stundenHer: 24 * 40, betragCents: 3000, quelle: 'paypal', anzeigename: 'Flocke', nachricht: null }
])

const HOUR_MS = 60 * 60 * 1000

function sqliteZeit(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function replaceDemoSpenden(db, now = new Date()) {
  db.prepare('DELETE FROM spenden_eingaenge WHERE is_demo = 1').run()
  const insert = db.prepare(`
    INSERT INTO spenden_eingaenge (betrag_cents, datum, quelle, anzeigename, nachricht, oeffentlich, is_demo, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
  for (const spende of DEMO_SPENDEN) {
    const zeit = new Date(now.getTime() - spende.stundenHer * HOUR_MS)
    insert.run(spende.betragCents, heuteIso(zeit), spende.quelle, spende.anzeigename, spende.nachricht, spende.oeffentlich ?? 1, sqliteZeit(zeit))
  }
  return DEMO_SPENDEN.length
}

module.exports = { DEMO_SPENDEN, replaceDemoSpenden }

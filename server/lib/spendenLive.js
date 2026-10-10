'use strict'

// „Spenden live“ auf /finanzierung: der Stand für GET /api/finanzierung/live und den Live-Strom (Server-Sent Events,
// GET /api/finanzierung/live/stream, routes/finanzierung.js). Nur Summen und, je Spende, was der Spender öffentlich
// zeigen wollte (Name und Nachricht nur mit oeffentlich = 1). Demo und echt werden nie gemischt: Es zählen die echten
// Spenden; nur wenn es noch keine gibt und die Demo-Regel des Laufbands es erlaubt (lib/community.js
// readDemoPartnerErlaubt - an in dev/staging, aus in Produktion), zeigt der Block die Demo-Spenden (demo: true).
// kostenMonat = laufende Posten aller Kategorien, die diesen Monat laufen (Jahresbeträge als Monatsrate). Die Vorleistung
// („Anschub“) steht mit ihrem gedeckten Teil dabei (lib/finanzierung.js publicFinanzierung).

const db = require('../db')
const { listKosten } = require('./finanzierungKosten')
const { monatsrateCents } = require('./finanzierungVerteilung')
const { readDemoPartnerErlaubt, clearCommunityCache } = require('./community')
const { publicFinanzierung } = require('./finanzierung')
const { ipKeyGenerator } = require('./rateLimitKey')
require('./spenden') // legt spenden_eingaenge an

const LETZTE_MAX = 10
const MAX_STREAMS = 100
const MAX_STREAMS_PRO_IP = 4
// Liest ein Client nicht mehr mit (Puffer wächst), wird sein Strom geschlossen - er fragt dann regelmäßig nach.
const MAX_PUFFER_BYTES = 64 * 1024
const HEARTBEAT_MS = 25 * 1000
const RETRY_MS = 60 * 1000

const echteAnzahlStmt = db.prepare('SELECT COUNT(*) AS n FROM spenden_eingaenge WHERE is_demo = 0')
const summeAbStmt = db.prepare('SELECT COALESCE(SUM(betrag_cents), 0) AS cents FROM spenden_eingaenge WHERE is_demo = ? AND datum >= ?')
const summeGesamtStmt = db.prepare('SELECT COALESCE(SUM(betrag_cents), 0) AS cents FROM spenden_eingaenge WHERE is_demo = ?')
const letzteStmt = db.prepare(`
  SELECT betrag_cents, datum, quelle, anzeigename, nachricht, created_at FROM spenden_eingaenge
  WHERE is_demo = ? AND oeffentlich = 1 ORDER BY datum DESC, id DESC LIMIT ${LETZTE_MAX}`)

function monatsAnfang(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

// Läuft der Posten in diesem Monat? (wie finanzierungVerteilung laeuftNoch, auf Monatsebene)
function laeuftDiesenMonat(posten, monat) {
  return posten.ab.slice(0, 7) <= monat && (!posten.bis || posten.bis.slice(0, 7) >= monat)
}

function kostenMonatCents(now) {
  const monat = monatsAnfang(now).slice(0, 7)
  const summe = listKosten()
    .filter((posten) => laeuftDiesenMonat(posten, monat))
    .reduce((acc, posten) => acc + monatsrateCents(posten), 0)
  return Math.round(summe)
}

function nutzeDemo() {
  return echteAnzahlStmt.get().n === 0 && readDemoPartnerErlaubt()
}

function publicEintrag(row) {
  return {
    betragCents: row.betrag_cents,
    datum: row.datum,
    // Zeitpunkt der Erfassung (UTC) - für „vor 2 Stunden“; das Datum bleibt maßgeblich.
    erfasst: `${row.created_at.replace(' ', 'T')}Z`,
    name: row.anzeigename || null,
    nachricht: row.nachricht || null,
    quelle: row.quelle
  }
}

function vorleistungKurz(vorleistung) {
  if (!vorleistung || !vorleistung.gesamtCents) return null
  const kategorien = [...new Set(vorleistung.posten.map((posten) => posten.kategorie))]
  return { gesamtCents: vorleistung.gesamtCents, gedecktCents: vorleistung.gedecktCents, offenCents: vorleistung.offenCents, kategorien }
}

function liveStand(now = new Date()) {
  const demo = nutzeDemo()
  const flag = demo ? 1 : 0
  const summeMonat = summeAbStmt.get(flag, monatsAnfang(now)).cents
  const kostenMonat = kostenMonatCents(now)
  return {
    summeMonat,
    summeJahr: summeAbStmt.get(flag, `${now.getFullYear()}-01-01`).cents,
    summeGesamt: summeGesamtStmt.get(flag).cents,
    kostenMonat,
    deckungProzent: kostenMonat > 0 ? Math.round((summeMonat * 100) / kostenMonat) : null,
    letzte: letzteStmt.all(flag).map(publicEintrag),
    vorleistung: vorleistungKurz(publicFinanzierung().vorleistung),
    demo,
    stand: now.toISOString()
  }
}

// --- Live-Strom (SSE) --------------------------------------------------------------------------------------------------

const streams = new Set()
const streamsProIp = new Map()
let heartbeat = null

// Schreibt in einen Strom; staut sich dort zu viel (Client liest nicht mit), wird er beendet - close räumt auf.
function schreibe(res, text) {
  if (res.writableLength > MAX_PUFFER_BYTES) {
    res.destroy()
    return
  }
  res.write(text)
}

function sendStand(res, payload) {
  schreibe(res, `event: stand\ndata: ${JSON.stringify(payload)}\n\n`)
}

function zaehleIp(key, delta) {
  const n = (streamsProIp.get(key) || 0) + delta
  if (n > 0) streamsProIp.set(key, n)
  else streamsProIp.delete(key)
}

function stopHeartbeatIfIdle() {
  if (streams.size || !heartbeat) return
  clearInterval(heartbeat)
  heartbeat = null
}

// false, wenn schon MAX_STREAMS Verbindungen (oder MAX_STREAMS_PRO_IP von dieser IP) offen sind - der Client fragt
// dann alle 60 s nach.
function openStream(req, res) {
  const ipKey = ipKeyGenerator(req)
  if (streams.size >= MAX_STREAMS || (streamsProIp.get(ipKey) || 0) >= MAX_STREAMS_PRO_IP) return false
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.write(`retry: ${RETRY_MS}\n\n`)
  sendStand(res, liveStand())
  streams.add(res)
  zaehleIp(ipKey, 1)
  if (!heartbeat) {
    heartbeat = setInterval(() => streams.forEach((stream) => schreibe(stream, ': ping\n\n')), HEARTBEAT_MS)
    heartbeat.unref()
  }
  let offen = true
  const schliessen = () => {
    if (!offen) return
    offen = false
    streams.delete(res)
    zaehleIp(ipKey, -1)
    stopHeartbeatIfIdle()
  }
  req.on('close', schliessen)
  res.on('close', schliessen)
  return true
}

// Nach jeder Änderung an den Spenden: Laufband-Speicher leeren und allen offenen Strömen den neuen Stand schicken.
function meldeSpendenAenderung() {
  clearCommunityCache()
  if (!streams.size) return
  const payload = liveStand()
  streams.forEach((stream) => sendStand(stream, payload))
}

function offeneStreams() {
  return streams.size
}

module.exports = { LETZTE_MAX, MAX_STREAMS, MAX_STREAMS_PRO_IP, MAX_PUFFER_BYTES, liveStand, openStream, meldeSpendenAenderung, offeneStreams }

'use strict'

// Phase G Task 6, Admin-Reiter „Server“ (GET /api/admin/server, routes/adminServer.js): Arbeitsspeicher, Speicherplatz,
// Last und Laufzeit je Aufruf frisch (billig: /proc/meminfo, statfs, loadavg), die Ordnergrößen dagegen höchstens einmal
// je Stunde (SIZE_TTL_MS) und zwischengespeichert - gleichzeitige Anfragen teilen sich eine Berechnung, eine Anfrage
// wartet höchstens SIZE_WAIT_MS darauf. Dazu der stündliche Lauf (runHourly): Messung in den Verlauf (lib/serverHistory.js),
// Verlauf nach 30 Tagen löschen, Größen auffrischen, Warnungen prüfen (lib/serverWarnings.js).
// Nach außen nur Zahlen und feste Schlüssel - nie Pfade, Hostnamen, Fehlermeldungen oder Umgebungswerte (außer dem
// Kurz-SHA des Stands). Ein fehlschlagender Messwert wird null, der Rest bleibt.
// Tests bauen sich mit createServerMonitor({ probe, dirs, warnings, commit }) einen eigenen Monitor mit festen Werten.

const config = require('../config')
const { systemProbe } = require('./serverProbe')
const history = require('./serverHistory')
const { readBackupMarker } = require('./autoBackup')
const { THRESHOLDS, ampel, usedPercent } = require('./serverThresholds')

const SIZE_TTL_MS = 60 * 60 * 1000
const SIZE_WAIT_MS = 1500
const HOURLY_MS = 60 * 60 * 1000
const WARN_SAMPLES = 3
const SHORT_SHA_LENGTH = 7
const SAFE_CODE_RE = /^[A-Z][A-Z0-9_]{1,39}$/

const iso = (ms) => new Date(ms).toISOString()

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

async function settle(fn) {
  try {
    const value = await fn()
    return value ?? null
  } catch {
    return null
  }
}

// Wartet auf promise, höchstens ms lang (der Zeitgeber wird danach abgeräumt).
function waitAtMost(promise, ms) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function defaultDirs() {
  const { dataDir, dbPath, uploadDir, partnerMediaDir, backupDir } = config
  return { dataDir, dbPath, uploadDir, partnerMediaDir, backupDir }
}

// Rohwerte einer Messung (ungerundet) - Grundlage für Ampel, Verlauf und Warnungen.
function rawValues({ mem, disk, load, rss }) {
  const memUsedPct = mem ? usedPercent(mem.total - mem.available, mem.available) : null
  const diskUsedPct = disk ? usedPercent(disk.used, disk.free) : null
  const perCore = load && load.cores > 0 ? load.load1 / load.cores : null
  return {
    mem_used_pct: memUsedPct,
    disk_used_pct: diskUsedPct,
    load1: load?.load1 ?? null,
    load5: load?.load5 ?? null,
    app_rss: rss,
    perCore
  }
}

// Anzeige: gerundete Werte, die Ampel nach genau diesen Werten - was man sieht, passt immer zur Ampel ("80 %" ist nie
// „erhöht“). Die Warnungen (lib/serverWarnings.js) rechnen mit den Rohwerten aus dem Verlauf.
function sections(current) {
  const { mem, disk, load, uptime, rss } = current
  const raw = rawValues(current)
  const memPct = round(raw.mem_used_pct)
  const diskPct = round(raw.disk_used_pct)
  const perCore = round(raw.perCore, 2)
  return {
    speicher: mem && { gesamt: mem.total, verfuegbar: mem.available, app: rss, belegtProzent: memPct, ampel: ampel(memPct, THRESHOLDS.speicher) },
    platte: disk && { gesamt: disk.total, frei: disk.free, belegtProzent: diskPct, ampel: ampel(diskPct, THRESHOLDS.platte) },
    last: load && {
      kerne: load.cores,
      load1: round(load.load1, 2),
      load5: round(load.load5, 2),
      load15: round(load.load15, 2),
      proKern: perCore,
      ampel: ampel(perCore, THRESHOLDS.last)
    },
    laufzeit: uptime && { server: Math.round(uptime.server), app: Math.round(uptime.app) }
  }
}

function verlaufPoint(row) {
  const free = (pct) => (Number.isFinite(pct) ? round(100 - pct) : null)
  return { at: row.at, speicherFrei: free(row.mem_used_pct), platteFrei: free(row.disk_used_pct), last: round(row.load1, 2) }
}

function backupInfo(dir) {
  const marker = readBackupMarker(dir)
  return marker && { at: marker.at, bytes: marker.bytes, art: marker.kind }
}

async function measure(probe, dirs) {
  const [mem, disk] = await Promise.all([settle(() => probe.memory()), settle(() => probe.disk(dirs.dataDir))])
  const [load, uptime, rss] = await Promise.all([settle(() => probe.load()), settle(() => probe.uptime()), settle(() => probe.appRss())])
  return { at: probe.now(), mem, disk, load, uptime, rss }
}

// Nacheinander statt gleichzeitig: die Platte soll für die App frei bleiben. Ein Ordner, der nicht lesbar ist, wird null.
async function computeSizes(probe, dirs) {
  const db = await settle(() => probe.fileSize(dirs.dbPath))
  const wal = await settle(() => probe.fileSize(`${dirs.dbPath}-wal`))
  const chronikFotos = await settle(() => probe.dirSize(dirs.uploadDir))
  const partnerBilder = await settle(() => probe.dirSize(dirs.partnerMediaDir))
  const sicherungen = await settle(() => probe.dirSize(dirs.backupDir))
  const sum = (...values) => (values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) : null)
  return { datenbank: sum(db, wal), fotos: sum(chronikFotos, partnerBilder), chronikFotos, partnerBilder, sicherungen }
}

function createServerMonitor({ probe = systemProbe, dirs = defaultDirs(), warnings, commit = config.appCommit, sizeWaitMs = SIZE_WAIT_MS } = {}) {
  const warner = warnings ?? require('./serverWarnings').serverWarnings()
  let sizes = null
  let sizesInFlight = null

  // Liefert die zwischengespeicherten Größen { at, value } - neu berechnet nur, wenn sie fehlen oder älter als eine
  // Stunde sind; läuft schon eine Berechnung, wird sie geteilt. at ist der BEGINN der Berechnung, damit der stündliche
  // Lauf sie wirklich jede Stunde erneuert (sonst wäre sie beim nächsten Lauf um die Dauer der Berechnung zu jung).
  function refreshSizes() {
    if (sizes && probe.now() - sizes.at < SIZE_TTL_MS) return Promise.resolve(sizes)
    if (!sizesInFlight) {
      const startedAt = probe.now()
      sizesInFlight = computeSizes(probe, dirs)
        .then((value) => {
          sizes = { at: startedAt, value }
          return sizes
        })
        .finally(() => {
          sizesInFlight = null
        })
    }
    return sizesInFlight
  }

  async function status() {
    await waitAtMost(refreshSizes(), sizeWaitMs)
    const current = await measure(probe, dirs)
    return {
      gemessenAt: iso(current.at),
      ...sections(current),
      groessen: sizes && { ...sizes.value, berechnetAt: iso(sizes.at) },
      stand: { version: commit ? commit.slice(0, SHORT_SHA_LENGTH) : null, letztesBackup: backupInfo(dirs.backupDir) },
      verlauf: history.listSamples({ now: current.at }).map(verlaufPoint),
      schwellen: THRESHOLDS,
      warnungen: warner.status()
    }
  }

  async function runHourly() {
    const current = await measure(probe, dirs)
    history.recordSample(rawValues(current), { now: current.at })
    history.purgeSamples({ now: current.at })
    await refreshSizes()
    await warner.check({ samples: history.recentSamples(WARN_SAMPLES), cores: current.load?.cores ?? null, now: current.at })
  }

  return { status, runHourly, refreshSizes }
}

// --- Gemeinsamer Monitor des Servers ------------------------------------------------------------------

let monitor = null

function serverMonitor() {
  if (!monitor) monitor = createServerMonitor()
  return monitor
}

// Nur für Tests: einen eigenen Monitor einsetzen. Gibt restore() zurück.
function setServerMonitorForTests(replacement) {
  const previous = monitor
  monitor = replacement
  return () => {
    monitor = previous
  }
}

function errorCode(err) {
  return typeof err?.code === 'string' && SAFE_CODE_RE.test(err.code) ? err.code : 'unbekannt'
}

// Einmal sofort, danach stündlich (unref: hält den Prozess nicht am Leben). Jeder Fehler - auch beim Anlegen des Monitors -
// wird EINE Logzeile mit Code, nie ein Absturz. Gibt { timer, firstRun } zurück (firstRun für Tests). Nur aus index.js.
function scheduleServerMetrics({ logger = console } = {}) {
  const run = async () => {
    try {
      await serverMonitor().runHourly()
    } catch (err) {
      logger.warn(`Server-Messung fehlgeschlagen (${errorCode(err)})`)
    }
  }
  const firstRun = run()
  const timer = setInterval(run, HOURLY_MS).unref()
  return Object.freeze({ timer, firstRun })
}

module.exports = { SIZE_TTL_MS, createServerMonitor, serverMonitor, setServerMonitorForTests, scheduleServerMetrics }

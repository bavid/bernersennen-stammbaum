'use strict'

// Phase G Task 6: tägliche Datenbank-Sicherung in der App (bisher nur vor Deploys, deploy/remote.sh backup). Einmal je
// Tag ab 03:30 Berliner Zeit ein Online-Backup über die SQLite-Backup-API von better-sqlite3 (db.backup, läuft in
// Schritten - die App bleibt erreichbar) nach <daten>/backups/auto-JJJJ-MM-TT.db. Die neuesten KEEP_AUTO_BACKUPS
// bleiben, ältere automatische Sicherungen werden gelöscht - andere Dateien im Ordner nie. Danach die Markierung
// last-backup.json { at, bytes, kind: 'auto' }, die auch deploy/remote.sh backup schreibt (kind 'deploy', aus dem
// Container heraus) - der Admin-Reiter „Server“ zeigt daraus das letzte Backup. Nur die Datenbank: die Fotos sichert
// weiterhin remote.sh. Ordner 0700, Dateien 0600 (schon während SQLite schreibt): die Kopien enthalten alles.
// Ist auf dem Laufwerk weniger frei als zweimal die Datenbank plus MIN_RESERVE_BYTES, entfällt die Sicherung - sie soll
// die laufende Datenbank nie um ihren Platz bringen.
// Gestartet nur aus index.js (scheduleAutoBackup) und nur mit config.autoBackup - Tests rufen die Teile direkt mit
// eigener Datenbank und eigenem Ordner auf. Ins Log kommen nie Pfade, nur Größe bzw. Fehlercode.

const fs = require('node:fs')
const path = require('node:path')
const { berlinNow } = require('./terminSerien')

const KEEP_AUTO_BACKUPS = 14
const AUTO_RE = /^auto-\d{4}-\d{2}-\d{2}\.db$/
const STALE_TMP_RE = /^auto-\d{4}-\d{2}-\d{2}\.db\.tmp$/
const STALE_TMP_MS = 24 * 60 * 60 * 1000
const MARKER_FILE = 'last-backup.json'
// Sicherung außer Haus (deploy/haertung/fap-backup.sh, restic → Storage Box): eigene Datei, damit sie die tägliche
// App-Sicherung in last-backup.json nicht überschreibt; geschrieben vom Server (root) mit Besitzer des Ordners.
const OFFSITE_MARKER_FILE = 'last-offsite-backup.json'
const MARKER_MAX_BYTES = 4096
const KINDS = Object.freeze(['auto', 'deploy', 'offsite'])
const DUE_TIME = '03:30'
const CHECK_INTERVAL_MS = 15 * 60 * 1000
const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000
const MIN_RESERVE_BYTES = 512 * 1024 * 1024
const FILE_MODE = 0o600
const DIR_MODE = 0o700
const SAFE_CODE_RE = /^[A-Z][A-Z0-9_]{1,39}$/
// Ohne Symlinks folgen und ohne auf eine FIFO zu warten (unter Windows gibt es beide Flags nicht - dann 0).
const MARKER_OPEN_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0)

function autoFileName(now) {
  return `auto-${berlinNow(new Date(now)).datum}.db`
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
}

function codeError(code, message) {
  return Object.assign(new Error(message), { code })
}

// Geprüfte Markierung { at (ISO), bytes, kind } - oder null, wenn etwas nicht passt.
function cleanMarker(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { at, bytes, kind } = value
  if (!isIsoDate(at) || !Number.isSafeInteger(bytes) || bytes < 0 || !KINDS.includes(kind)) return null
  return { at: new Date(at).toISOString(), bytes, kind }
}

// Liest die Markierung; fehlt sie oder ist sie unbrauchbar (keine normale Datei, größer als MARKER_MAX_BYTES, kaputt,
// falsche Felder), null. Die Größe wird VOR dem Lesen geprüft - nie eine riesige Datei in den Speicher.
function readBackupMarker(dir) {
  return readMarkerFile(path.join(dir, MARKER_FILE))
}

// Markierung der Sicherung außer Haus - nur mit kind 'offsite', sonst null.
function readOffsiteMarker(dir) {
  const marker = readMarkerFile(path.join(dir, OFFSITE_MARKER_FILE))
  return marker && marker.kind === 'offsite' ? marker : null
}

function readMarkerFile(file) {
  let fd = null
  try {
    fd = fs.openSync(file, MARKER_OPEN_FLAGS)
    const stats = fs.fstatSync(fd)
    if (!stats.isFile() || stats.size > MARKER_MAX_BYTES) return null
    const buffer = Buffer.alloc(stats.size)
    const length = fs.readSync(fd, buffer, 0, stats.size, 0)
    return cleanMarker(JSON.parse(buffer.toString('utf8', 0, length)))
  } catch {
    return null
  } finally {
    if (fd !== null) fs.closeSync(fd)
  }
}

async function ensurePrivateDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true, mode: DIR_MODE })
  await fs.promises.chmod(dir, DIR_MODE)
}

// Schreibt die Markierung atomar (Zwischendatei + rename) - ein gleichzeitiger Leser sieht nie eine halbe Datei.
async function writeBackupMarker(dir, marker) {
  const clean = cleanMarker(marker)
  if (!clean) throw new Error('Ungültige Backup-Markierung')
  await ensurePrivateDir(dir)
  const target = path.join(dir, MARKER_FILE)
  const tmp = `${target}.tmp`
  await fs.promises.writeFile(tmp, `${JSON.stringify(clean)}\n`, { mode: FILE_MODE })
  await fs.promises.rename(tmp, target)
  return clean
}

// Liegengebliebene Zwischendateien (Absturz mitten in einer Sicherung), älter als STALE_TMP_MS.
async function staleTmpFiles(dir, names, now) {
  const stale = []
  for (const name of names.filter((candidate) => STALE_TMP_RE.test(candidate))) {
    const stats = await fs.promises.lstat(path.join(dir, name)).catch(() => null)
    if (stats && now - stats.mtimeMs > STALE_TMP_MS) stale.push(name)
  }
  return stale
}

// Löscht alle automatischen Sicherungen außer den neuesten `keep` (der Name trägt das Datum, sortiert also richtig) und
// alte Zwischendateien. Gibt die Anzahl der gelöschten Dateien zurück; ohne Ordner 0. Lässt sich ein Eintrag nicht
// löschen (z. B. ein Ordner mit passendem Namen), bleibt er stehen - die übrigen werden trotzdem gelöscht.
async function rotateAutoBackups(dir, keep = KEEP_AUTO_BACKUPS, now = Date.now()) {
  let names
  try {
    names = await fs.promises.readdir(dir)
  } catch (err) {
    if (err.code === 'ENOENT') return 0
    throw err
  }
  const old = names.filter((name) => AUTO_RE.test(name)).sort().reverse().slice(keep)
  let removed = 0
  for (const name of [...old, ...(await staleTmpFiles(dir, names, now))]) {
    try {
      await fs.promises.unlink(path.join(dir, name))
      removed += 1
    } catch {
      // stehen lassen - siehe oben
    }
  }
  return removed
}

// Ab 03:30 Berliner Zeit fällig, solange es die Sicherung dieses Tages noch nicht gibt - so holt ein Neustart nach
// 03:30 die Sicherung des Tages nach, statt sie ausfallen zu lassen.
function isBackupDue(dir, now = Date.now()) {
  if (berlinNow(new Date(now)).zeit < DUE_TIME) return false
  return !fs.existsSync(path.join(dir, autoFileName(now)))
}

async function diskFreeBytes(dir) {
  const stats = await fs.promises.statfs(dir)
  return stats.bavail * stats.bsize
}

async function databaseBytes(db) {
  const sizes = await Promise.all([db.name, `${db.name}-wal`].map((file) => fs.promises.stat(file).then((s) => s.size, () => 0)))
  return sizes.reduce((sum, size) => sum + size, 0)
}

// Eine Sicherung anlegen: erst in eine leere, private Zwischendatei (bei einem Fehler wieder gelöscht, nie eine halbe
// Sicherung unter dem richtigen Namen), dann umbenennen, Markierung schreiben, alte Sicherungen löschen. removed ist null,
// wenn das Aufräumen scheiterte - die Sicherung selbst gilt trotzdem. freeBytes nur für Tests austauschbar.
async function createAutoBackup({ db, dir, now = Date.now(), freeBytes = diskFreeBytes }) {
  await ensurePrivateDir(dir)
  if ((await freeBytes(dir)) < 2 * (await databaseBytes(db)) + MIN_RESERVE_BYTES) {
    throw codeError('ZU_WENIG_PLATZ', 'Zu wenig freier Speicherplatz für die Sicherung')
  }
  const file = autoFileName(now)
  const target = path.join(dir, file)
  const tmp = `${target}.tmp`
  await fs.promises.rm(tmp, { force: true })
  try {
    await fs.promises.writeFile(tmp, '', { mode: FILE_MODE })
    await db.backup(tmp)
    await fs.promises.chmod(tmp, FILE_MODE)
    await fs.promises.rename(tmp, target)
  } finally {
    await fs.promises.rm(tmp, { force: true })
  }
  const { size } = await fs.promises.stat(target)
  await writeBackupMarker(dir, { at: new Date(now).toISOString(), bytes: size, kind: 'auto' })
  const removed = await rotateAutoBackups(dir, KEEP_AUTO_BACKUPS, now).catch(() => null)
  return { file, bytes: size, removed }
}

function errorCode(err) {
  return typeof err?.code === 'string' && SAFE_CODE_RE.test(err.code) ? err.code : 'unbekannt'
}

// Prüft jetzt und danach alle 15 Minuten, ob die Sicherung fällig ist (unref: hält den Prozess nicht am Leben). Nie zwei
// Läufe gleichzeitig; nach einem Fehler frühestens nach RETRY_AFTER_FAILURE_MS wieder (eine Logzeile je Stunde statt je
// Viertelstunde). Gibt { timer, check, firstRun } zurück - check/firstRun für Tests. Nur aus index.js aufrufen.
function scheduleAutoBackup({ db = require('../db'), dir = require('../config').backupDir, logger = console, clock = Date.now } = {}) {
  let running = false
  let failedAt = null
  async function check() {
    if (running) return
    running = true
    try {
      const now = clock()
      if (failedAt !== null && now - failedAt < RETRY_AFTER_FAILURE_MS) return
      if (!isBackupDue(dir, now)) return
      const { bytes, removed } = await createAutoBackup({ db, dir, now })
      failedAt = null
      const cleanup = removed === null ? 'alte nicht aufgeräumt' : `${removed} alte entfernt`
      logger.log(`Datenbank-Sicherung angelegt (${Math.round(bytes / 1024)} KB, ${cleanup})`)
    } catch (err) {
      failedAt = clock()
      logger.warn(`Tägliche Datenbank-Sicherung fehlgeschlagen (${errorCode(err)})`)
    } finally {
      running = false
    }
  }
  const firstRun = check()
  const timer = setInterval(check, CHECK_INTERVAL_MS).unref()
  return Object.freeze({ timer, check, firstRun })
}

module.exports = {
  KEEP_AUTO_BACKUPS,
  MARKER_FILE,
  OFFSITE_MARKER_FILE,
  createAutoBackup,
  rotateAutoBackups,
  readBackupMarker,
  readOffsiteMarker,
  writeBackupMarker,
  isBackupDue,
  scheduleAutoBackup
}

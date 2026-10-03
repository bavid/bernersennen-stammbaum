const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Database = require('better-sqlite3')
const { useTempDataDir } = require('./helpers')

// Phase G Task 6: tägliche Datenbank-Sicherung (lib/autoBackup.js) - Online-Backup per better-sqlite3 nach
// <daten>/backups/auto-JJJJ-MM-TT.db (Berliner Datum), die neuesten 14 bleiben, Markierung last-backup.json. Alles in
// einem eigenen Temp-Verzeichnis, nie gegen server/data.db.
const dataDir = useTempDataDir('auto-backup')
const backupDir = path.join(dataDir, 'backups')

const {
  KEEP_AUTO_BACKUPS,
  createAutoBackup,
  rotateAutoBackups,
  readBackupMarker,
  writeBackupMarker,
  isBackupDue,
  scheduleAutoBackup
} = require('../lib/autoBackup')

// 03.10.2026: Berlin ist UTC+2 (Sommerzeit).
const BEFORE_DUE = Date.parse('2026-10-03T01:00:00Z') // 03:00 Berlin
const AFTER_DUE = Date.parse('2026-10-03T01:45:00Z') // 03:45 Berlin
const BERLIN_NEXT_DAY = Date.parse('2026-10-03T23:10:00Z') // 04.10. 01:10 Berlin, in UTC noch der 03.10.

function sourceDb() {
  const db = new Database(path.join(dataDir, 'quelle.db'))
  db.exec("CREATE TABLE IF NOT EXISTS tiere (name TEXT); INSERT INTO tiere VALUES ('Benno'), ('Wilma')")
  return db
}

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))

test('createAutoBackup: lesbare Kopie unter dem Berliner Datum, Markierung mit Zeit, Größe und Art', async () => {
  const db = sourceDb()
  try {
    const result = await createAutoBackup({ db, dir: backupDir, now: AFTER_DUE })
    const file = path.join(backupDir, 'auto-2026-10-03.db')
    assert.equal(result.file, 'auto-2026-10-03.db')
    assert.ok(fs.existsSync(file))
    assert.equal(fs.existsSync(`${file}.tmp`), false, 'keine Zwischendatei bleibt liegen')

    const copy = new Database(file, { readonly: true })
    assert.deepEqual(copy.prepare('SELECT name FROM tiere ORDER BY name').all().map((row) => row.name), ['Benno', 'Wilma'])
    copy.close()

    const bytes = fs.statSync(file).size
    assert.equal(result.bytes, bytes)
    assert.deepEqual(readBackupMarker(backupDir), { at: '2026-10-03T01:45:00.000Z', bytes, kind: 'auto' })
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'nur für den App-Nutzer lesbar')

    // Spät am Abend in UTC ist in Berlin schon der nächste Tag.
    const next = await createAutoBackup({ db, dir: backupDir, now: BERLIN_NEXT_DAY })
    assert.equal(next.file, 'auto-2026-10-04.db')
  } finally {
    db.close()
  }
})

test('rotateAutoBackups: nur die neuesten 14 automatischen Sicherungen bleiben, fremde Dateien nie angefasst', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-rotate-'))
  try {
    const names = Array.from({ length: 20 }, (_, index) => `auto-2026-09-${String(index + 1).padStart(2, '0')}.db`)
    for (const name of [...names, 'chronik-2026-09-01.tgz', 'auto-notizen.txt', 'last-backup.json']) {
      fs.writeFileSync(path.join(dir, name), 'x')
    }
    assert.equal(KEEP_AUTO_BACKUPS, 14)
    assert.equal(await rotateAutoBackups(dir), 6)
    const left = fs.readdirSync(dir).sort()
    assert.deepEqual(left.filter((name) => /^auto-\d/.test(name)), names.slice(6))
    for (const kept of ['chronik-2026-09-01.tgz', 'auto-notizen.txt', 'last-backup.json']) assert.ok(left.includes(kept), kept)
    assert.equal(await rotateAutoBackups(dir), 0, 'nichts mehr zu tun')
    assert.equal(await rotateAutoBackups(path.join(dir, 'gibt-es-nicht')), 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('Markierung: nur gültige Angaben zählen, sonst null', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-marker-'))
  try {
    assert.equal(readBackupMarker(dir), null, 'ohne Datei')
    await writeBackupMarker(dir, { at: '2026-10-01T02:00:00Z', bytes: 1234, kind: 'deploy' })
    assert.deepEqual(readBackupMarker(dir), { at: '2026-10-01T02:00:00.000Z', bytes: 1234, kind: 'deploy' })

    const marker = path.join(dir, 'last-backup.json')
    for (const bad of [
      '{kaputt',
      JSON.stringify({ at: 'gestern', bytes: 1, kind: 'auto' }),
      JSON.stringify({ at: '2026-10-01T02:00:00Z', bytes: -1, kind: 'auto' }),
      JSON.stringify({ at: '2026-10-01T02:00:00Z', bytes: 1.5, kind: 'auto' }),
      JSON.stringify({ at: '2026-10-01T02:00:00Z', bytes: 1, kind: 'pfad' }),
      JSON.stringify([1, 2]),
      'x'.repeat(5000)
    ]) {
      fs.writeFileSync(marker, bad)
      assert.equal(readBackupMarker(dir), null, bad.slice(0, 40))
    }
    await assert.rejects(writeBackupMarker(dir, { at: 'gestern', bytes: 1, kind: 'auto' }))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('isBackupDue: ab 03:30 Berliner Zeit, einmal je Tag', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-due-'))
  try {
    assert.equal(isBackupDue(dir, BEFORE_DUE), false, 'vor 03:30')
    assert.equal(isBackupDue(dir, AFTER_DUE), true, 'nach 03:30, heute noch keine')
    fs.writeFileSync(path.join(dir, 'auto-2026-10-03.db'), 'x')
    assert.equal(isBackupDue(dir, AFTER_DUE), false, 'heute schon gesichert')
    assert.equal(isBackupDue(path.join(dir, 'neu'), AFTER_DUE), true, 'auch ohne Verzeichnis')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('config: AUTO_BACKUP an/aus, ohne Angabe nur lokal (dev) aus; APP_COMMIT nur als SHA', () => {
  const { readAutoBackup, readAppCommit } = require('../config')
  assert.equal(readAutoBackup('', 'production'), true)
  assert.equal(readAutoBackup(undefined, 'staging'), true)
  assert.equal(readAutoBackup('', 'dev'), false)
  assert.equal(readAutoBackup('true', 'dev'), true)
  assert.equal(readAutoBackup('0', 'production'), false)
  assert.equal(readAppCommit('03EB39D4f1c2'), '03eb39d4f1c2')
  assert.equal(readAppCommit(' 03eb39d '), '03eb39d')
  assert.equal(readAppCommit('b'.repeat(64)), 'b'.repeat(64), 'auch SHA-256')
  for (const bad of ['', undefined, 'abc', 'main', '03eb39d; rm', 'g'.repeat(40), 'a'.repeat(65)]) assert.equal(readAppCommit(bad), null, String(bad))
})

test('createAutoBackup: bei zu wenig freiem Platz keine Sicherung (Fehlercode, keine Datei)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-voll-'))
  const db = sourceDb()
  try {
    await assert.rejects(createAutoBackup({ db, dir, now: AFTER_DUE, freeBytes: async () => 1024 }), (err) => err.code === 'ZU_WENIG_PLATZ')
    assert.deepEqual(fs.readdirSync(dir), [], 'weder Sicherung noch Zwischendatei noch Markierung')
  } finally {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('rotateAutoBackups: alte Zwischendateien weg, ein nicht löschbarer Eintrag hält die übrigen nicht auf', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-rotate2-'))
  try {
    fs.mkdirSync(path.join(dir, 'auto-2026-08-01.db')) // ein Ordner mit passendem Namen, der älteste
    for (let day = 1; day <= 15; day += 1) fs.writeFileSync(path.join(dir, `auto-2026-09-${String(day).padStart(2, '0')}.db`), 'x')
    const staleTmp = path.join(dir, 'auto-2026-09-20.db.tmp')
    const freshTmp = path.join(dir, 'auto-2026-10-03.db.tmp')
    fs.writeFileSync(staleTmp, 'x')
    fs.writeFileSync(freshTmp, 'x')
    const twoDaysAgo = new Date(AFTER_DUE - 2 * 24 * 60 * 60 * 1000)
    fs.utimesSync(staleTmp, twoDaysAgo, twoDaysAgo)

    assert.equal(await rotateAutoBackups(dir, 14, AFTER_DUE), 2, 'die älteste Datei und die alte Zwischendatei')
    const left = fs.readdirSync(dir)
    assert.ok(left.includes('auto-2026-08-01.db'), 'der Ordner bleibt stehen')
    assert.ok(!left.includes('auto-2026-09-01.db'))
    assert.ok(!left.includes('auto-2026-09-20.db.tmp'))
    assert.ok(left.includes('auto-2026-10-03.db.tmp'), 'eine frische Zwischendatei gehört womöglich zu einer laufenden Sicherung')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('readBackupMarker: ein Ordner statt einer Datei zählt nicht', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-marker-dir-'))
  try {
    fs.mkdirSync(path.join(dir, 'last-backup.json'))
    assert.equal(readBackupMarker(dir), null)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('readBackupMarker: einem symbolischen Link wird nicht gefolgt', { skip: process.platform === 'win32' && 'Symlinks brauchen unter Windows Rechte' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-marker-link-'))
  try {
    const elsewhere = path.join(dir, 'woanders.json')
    fs.writeFileSync(elsewhere, JSON.stringify({ at: '2026-10-01T02:00:00Z', bytes: 1, kind: 'auto' }))
    fs.symlinkSync(elsewhere, path.join(dir, 'last-backup.json'))
    assert.equal(readBackupMarker(dir), null)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('scheduleAutoBackup: legt die fällige Sicherung an, nach einem Fehler erst eine Stunde später wieder; Log ohne Pfade', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-schedule-'))
  const lines = []
  const logger = { log: (line) => lines.push(line), warn: (line) => lines.push(line) }
  let clock = AFTER_DUE
  let attempts = 0
  const broken = {
    name: path.join(dir, 'fehlt.db'),
    backup: async () => {
      attempts += 1
      throw Object.assign(new Error(`SQLITE_CANTOPEN ${dir}`), { code: 'SQLITE_CANTOPEN' })
    }
  }
  const failing = scheduleAutoBackup({ db: broken, dir, logger, clock: () => clock })
  try {
    await failing.firstRun
    assert.deepEqual(lines, ['Tägliche Datenbank-Sicherung fehlgeschlagen (SQLITE_CANTOPEN)'])
    clock += 15 * 60 * 1000
    await failing.check()
    assert.equal(attempts, 1, 'nach einer Viertelstunde noch nicht wieder')
    clock += 50 * 60 * 1000
    await failing.check()
    assert.equal(attempts, 2, 'nach über einer Stunde erneut')
  } finally {
    clearInterval(failing.timer)
  }

  const db = sourceDb()
  lines.length = 0
  const working = scheduleAutoBackup({ db, dir, logger, clock: () => AFTER_DUE })
  try {
    await working.firstRun
    assert.ok(fs.existsSync(path.join(dir, 'auto-2026-10-03.db')))
    assert.equal(lines.length, 1)
    assert.match(lines[0], /^Datenbank-Sicherung angelegt \(\d+ KB, 0 alte entfernt\)$/)
    await working.check()
    assert.equal(lines.length, 1, 'heute schon gesichert - nichts mehr zu tun')
    for (const line of lines) assert.ok(!line.includes(dir))
  } finally {
    clearInterval(working.timer)
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

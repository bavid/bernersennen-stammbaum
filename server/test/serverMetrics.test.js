const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useTempDataDir } = require('./helpers')

// Phase G Task 6, Admin-Reiter „Server“: Ampel-Grenzen, Momentaufnahme mit gestubbter Probe, Verlauf (30 Tage) und der
// Zwischenspeicher der Ordnergrößen (höchstens einmal je Stunde). Nie das echte System: die Probe liefert feste Werte.
const dataDir = useTempDataDir('server-metrics')

const { THRESHOLDS, AMPEL, ampel, usedPercent } = require('../lib/serverThresholds')
const { parseMeminfo } = require('../lib/serverProbe')
const history = require('../lib/serverHistory')
const { createServerMonitor, SIZE_TTL_MS } = require('../lib/serverMetrics')
const db = require('../db')

const GB = 1024 ** 3
const MB = 1024 ** 2
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const START = Date.parse('2026-10-03T08:00:00Z')

const DIRS = Object.freeze({
  dataDir: path.join(dataDir, 'daten'),
  dbPath: path.join(dataDir, 'daten', 'data.db'),
  uploadDir: path.join(dataDir, 'daten', 'uploads'),
  partnerMediaDir: path.join(dataDir, 'daten', 'partner-media'),
  backupDir: path.join(dataDir, 'daten', 'backups')
})

// Feste Werte: 4 GB RAM (1 GB verfügbar = 75 % belegt), 40 GB Platte (30 GB belegt, 10 GB frei = 75 %), 2 Kerne, Last 1,2.
function stubProbe(overrides = {}) {
  const calls = { dirSize: [], fileSize: [] }
  let clock = START
  const probe = {
    calls,
    setNow: (ms) => {
      clock = ms
    },
    now: () => clock,
    memory: async () => ({ total: 4 * GB, available: 1 * GB }),
    disk: async () => ({ total: 40 * GB, used: 30 * GB, free: 10 * GB }),
    load: () => ({ cores: 2, load1: 1.2, load5: 0.9, load15: 0.5 }),
    uptime: () => ({ server: 3 * 86400 + 5, app: 7200.4 }),
    appRss: () => 42 * MB,
    fileSize: async (file) => {
      calls.fileSize.push(file)
      return file.endsWith('-wal') ? 1 * MB : 5 * MB
    },
    dirSize: async (dir) => {
      calls.dirSize.push(dir)
      if (dir === DIRS.uploadDir) return 300 * MB
      if (dir === DIRS.partnerMediaDir) return 20 * MB
      return 70 * MB
    },
    ...overrides
  }
  return probe
}

const quietWarnings = { check: async () => [], status: () => ({ aktiv: true, eingerichtet: false }) }

test.after(() => {
  db.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

test('Ampel: über der gelben Grenze erhöht, über der roten kritisch - genau auf der Grenze noch ok bzw. erhöht', () => {
  assert.deepEqual(THRESHOLDS, { speicher: { gelb: 80, rot: 90 }, platte: { gelb: 70, rot: 85 }, last: { gelb: 0.75, rot: 1 } })
  const cases = [
    ['speicher', 80, AMPEL.ok],
    ['speicher', 80.1, AMPEL.erhoeht],
    ['speicher', 90, AMPEL.erhoeht],
    ['speicher', 90.1, AMPEL.kritisch],
    ['platte', 70, AMPEL.ok],
    ['platte', 70.5, AMPEL.erhoeht],
    ['platte', 85, AMPEL.erhoeht],
    ['platte', 85.01, AMPEL.kritisch],
    // Last je Kern: bei 2 Kernen also 1,5 (gelb) und 2,0 (rot)
    ['last', 1.5 / 2, AMPEL.ok],
    ['last', 1.51 / 2, AMPEL.erhoeht],
    ['last', 2 / 2, AMPEL.erhoeht],
    ['last', 2.01 / 2, AMPEL.kritisch]
  ]
  for (const [metrik, value, expected] of cases) assert.equal(ampel(value, THRESHOLDS[metrik]), expected, `${metrik} ${value}`)
  assert.equal(ampel(null, THRESHOLDS.speicher), null)
  assert.equal(ampel(Number.NaN, THRESHOLDS.platte), null)
  assert.equal(usedPercent(30, 10), 75, 'wie df: belegt / (belegt + frei)')
  assert.equal(usedPercent(0, 0), null)
})

test('parseMeminfo: MemTotal und MemAvailable in Bytes', () => {
  const text = 'MemTotal:        3884040 kB\nMemFree:          301244 kB\nMemAvailable:    2934560 kB\n'
  assert.deepEqual(parseMeminfo(text), { total: 3884040 * 1024, available: 2934560 * 1024 })
  assert.deepEqual(parseMeminfo('MemTotal: 100 kB\n'), { total: 102400, available: null })
})

test('systemProbe: echte Ordnergröße (rekursiv), fehlende Ordner/Dateien 0, Laufwerk und Speicher als Zahlen', async () => {
  const { systemProbe } = require('../lib/serverProbe')
  const tree = path.join(dataDir, 'baum')
  fs.mkdirSync(path.join(tree, 'a', 'b'), { recursive: true })
  fs.writeFileSync(path.join(tree, 'eins.jpg'), Buffer.alloc(1000))
  fs.writeFileSync(path.join(tree, 'a', 'zwei.jpg'), Buffer.alloc(200))
  fs.writeFileSync(path.join(tree, 'a', 'b', 'drei.png'), Buffer.alloc(34))
  assert.equal(await systemProbe.dirSize(tree), 1234)
  assert.equal(await systemProbe.dirSize(path.join(tree, 'fehlt')), 0)
  assert.equal(await systemProbe.fileSize(path.join(tree, 'eins.jpg')), 1000)
  assert.equal(await systemProbe.fileSize(path.join(tree, 'fehlt.db')), 0)

  const disk = await systemProbe.disk(dataDir)
  assert.ok(disk.total > 0 && disk.free >= 0 && disk.used >= 0)
  const memory = await systemProbe.memory()
  assert.ok(memory.total > 0 && memory.available > 0 && memory.available <= memory.total)
  const load = systemProbe.load()
  assert.ok(load.cores >= 1 && Number.isFinite(load.load1))
  assert.ok(systemProbe.appRss() > 0)
})

test('status: Werte mit Ampel, Laufzeit, Stand und Größen - ohne Pfade', async () => {
  const probe = stubProbe()
  const monitor = createServerMonitor({ probe, dirs: DIRS, warnings: quietWarnings, commit: '03eb39d4f1c2a7b8' })
  const status = await monitor.status()

  assert.equal(status.gemessenAt, '2026-10-03T08:00:00.000Z')
  assert.deepEqual(status.speicher, { gesamt: 4 * GB, verfuegbar: 1 * GB, app: 42 * MB, belegtProzent: 75, ampel: 'ok' })
  assert.deepEqual(status.platte, { gesamt: 40 * GB, frei: 10 * GB, belegtProzent: 75, ampel: 'erhoeht' })
  assert.deepEqual(status.last, { kerne: 2, load1: 1.2, load5: 0.9, load15: 0.5, proKern: 0.6, ampel: 'ok' })
  assert.deepEqual(status.laufzeit, { server: 259205, app: 7200 })
  assert.deepEqual(status.stand, { version: '03eb39d', letztesBackup: null, ausserHaus: null })
  assert.deepEqual(status.groessen, {
    datenbank: 6 * MB,
    fotos: 320 * MB,
    chronikFotos: 300 * MB,
    partnerBilder: 20 * MB,
    sicherungen: 70 * MB,
    berechnetAt: '2026-10-03T08:00:00.000Z'
  })
  assert.deepEqual(status.schwellen, THRESHOLDS)
  assert.deepEqual(status.warnungen, { aktiv: true, eingerichtet: false })

  const json = JSON.stringify(status)
  assert.doesNotMatch(json, /[\\/]/, 'keine Pfade (kein / oder \\)')
  assert.ok(!json.includes(require('node:os').hostname()), 'kein Hostname')
})

test('status: ein fehlschlagender Messwert wird null, der Rest bleibt; ohne Commit "unbekannt" (null)', async () => {
  const probe = stubProbe({
    disk: async () => {
      throw Object.assign(new Error(`EACCES ${DIRS.dataDir}`), { code: 'EACCES' })
    },
    dirSize: async () => {
      throw new Error('kaputt')
    }
  })
  const status = await createServerMonitor({ probe, dirs: DIRS, warnings: quietWarnings, commit: null }).status()
  assert.equal(status.platte, null)
  assert.equal(status.speicher.ampel, 'ok')
  assert.equal(status.stand.version, null)
  assert.equal(status.groessen.chronikFotos, null)
  assert.equal(status.groessen.fotos, null)
  assert.equal(status.groessen.datenbank, 6 * MB)
  assert.doesNotMatch(JSON.stringify(status), /EACCES|[\\/]/)
})

test('status: ohne Markierung kein letztes Backup, mit Markierung Zeit, Größe und Art', async () => {
  const { writeBackupMarker } = require('../lib/autoBackup')
  await writeBackupMarker(DIRS.backupDir, { at: '2026-10-03T01:30:00Z', bytes: 4096, kind: 'auto' })
  const status = await createServerMonitor({ probe: stubProbe(), dirs: DIRS, warnings: quietWarnings }).status()
  assert.deepEqual(status.stand.letztesBackup, { at: '2026-10-03T01:30:00.000Z', bytes: 4096, art: 'auto' })
})

// DevOps Schritt 1, Block 6: deploy/haertung/fap-backup.sh schreibt nach der Sicherung außer Haus eine eigene Markierung
// last-offsite-backup.json (kind offsite) - sie erscheint getrennt vom letzten Backup auf dem Server.
test('status: Sicherung außer Haus aus der eigenen Markierung, getrennt vom letzten Backup', async () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const { OFFSITE_MARKER_FILE } = require('../lib/autoBackup')
  fs.writeFileSync(path.join(DIRS.backupDir, OFFSITE_MARKER_FILE), JSON.stringify({ at: '2026-10-03T01:50:00Z', bytes: 8192, kind: 'offsite' }))
  const status = await createServerMonitor({ probe: stubProbe(), dirs: DIRS, warnings: quietWarnings }).status()
  assert.deepEqual(status.stand.ausserHaus, { at: '2026-10-03T01:50:00.000Z', bytes: 8192, art: 'offsite' })
  assert.deepEqual(status.stand.letztesBackup, { at: '2026-10-03T01:30:00.000Z', bytes: 4096, art: 'auto' }, 'bleibt unberührt')
})

test('Ordnergrößen: höchstens einmal je Stunde berechnet, auch bei gleichzeitigen Aufrufen nur einmal', async () => {
  const probe = stubProbe()
  const monitor = createServerMonitor({ probe, dirs: DIRS, warnings: quietWarnings })
  await Promise.all([monitor.status(), monitor.status(), monitor.refreshSizes()])
  assert.equal(probe.calls.dirSize.length, 3, 'uploads, partner-media, backups je einmal')
  assert.deepEqual(probe.calls.fileSize, [DIRS.dbPath, `${DIRS.dbPath}-wal`])

  probe.setNow(START + SIZE_TTL_MS - 1000)
  await monitor.status()
  await monitor.runHourly()
  assert.equal(probe.calls.dirSize.length, 3, 'innerhalb der Stunde aus dem Zwischenspeicher')

  probe.setNow(START + SIZE_TTL_MS + 1000)
  const status = await monitor.status()
  assert.equal(probe.calls.dirSize.length, 6, 'nach einer Stunde neu berechnet')
  assert.equal(status.groessen.berechnetAt, new Date(START + SIZE_TTL_MS + 1000).toISOString())
  assert.equal(SIZE_TTL_MS, HOUR)
})

test('status wartet nicht ewig auf eine langsame erste Berechnung: Größen dann null', async () => {
  let release
  const slow = new Promise((resolve) => {
    release = resolve
  })
  const probe = stubProbe({ dirSize: async () => slow.then(() => 1) })
  const monitor = createServerMonitor({ probe, dirs: DIRS, warnings: quietWarnings, sizeWaitMs: 20 })
  const first = await monitor.status()
  assert.equal(first.groessen, null, 'wird noch berechnet')
  release()
  await monitor.refreshSizes()
  assert.equal((await monitor.status()).groessen.chronikFotos, 1)
})

test('Verlauf: stündliche Messung, Neustart innerhalb der Stunde ohne zweite Zeile, nach 30 Tagen gelöscht', async () => {
  db.prepare('DELETE FROM server_messwerte').run()
  const probe = stubProbe()
  const checks = []
  const warnings = { check: async (args) => checks.push(args), status: quietWarnings.status }
  const monitor = createServerMonitor({ probe, dirs: DIRS, warnings })

  await monitor.runHourly()
  probe.setNow(START + 10 * 60 * 1000)
  await monitor.runHourly()
  assert.equal(history.listSamples({ now: probe.now() }).length, 1, 'Neustart nach 10 Minuten: keine zweite Messung')
  const [row] = history.listSamples({ now: probe.now() })
  assert.deepEqual(row, { at: '2026-10-03T08:00:00.000Z', mem_used_pct: 75, disk_used_pct: 75, load1: 1.2, load5: 0.9, app_rss: 42 * MB })
  assert.equal(checks.length, 2, 'Warnungen werden trotzdem geprüft')
  assert.equal(checks[1].cores, 2)
  assert.equal(checks[1].samples.length, 1)

  for (let hour = 1; hour <= 3; hour += 1) {
    probe.setNow(START + hour * HOUR)
    await monitor.runHourly()
  }
  assert.equal(history.listSamples({ now: probe.now() }).length, 4)
  assert.deepEqual(checks.at(-1).samples.map((sample) => sample.at), [
    '2026-10-03T11:00:00.000Z',
    '2026-10-03T10:00:00.000Z',
    '2026-10-03T09:00:00.000Z'
  ], 'die letzten drei, neueste zuerst')

  // 30 Tage und eine Stunde später: alles bis auf die neue Messung ist weg.
  probe.setNow(START + 30 * DAY + 4 * HOUR)
  await monitor.runHourly()
  const left = history.listSamples({ now: probe.now() })
  assert.equal(left.length, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM server_messwerte').get().n, 1, 'auch in der Tabelle gelöscht')

  const status = await monitor.status()
  assert.deepEqual(status.verlauf, [{ at: left[0].at, speicherFrei: 25, platteFrei: 25, last: 1.2 }])
})

test('Ampel passt zur Anzeige: 80,04 % zeigt „80 %“ und ist ok, 0,752 je Kern zeigt „0,75“ und ist ok', async () => {
  const probe = stubProbe({
    memory: async () => ({ total: 10000, available: 1996 }), // 80,04 % belegt
    load: () => ({ cores: 2, load1: 1.504, load5: 1, load15: 1 }) // 0,752 je Kern
  })
  const status = await createServerMonitor({ probe, dirs: DIRS, warnings: quietWarnings }).status()
  assert.equal(status.speicher.belegtProzent, 80)
  assert.equal(status.speicher.ampel, 'ok')
  assert.equal(status.last.proKern, 0.75)
  assert.equal(status.last.ampel, 'ok')
})

test('Ordnergrößen: die Zeit zählt ab Beginn der Berechnung - der stündliche Lauf erneuert sie wirklich jede Stunde', async () => {
  const probe = stubProbe()
  const slowDirSize = probe.dirSize
  probe.dirSize = async (dir) => {
    probe.setNow(probe.now() + 2 * 60 * 1000) // jeder Ordner dauert zwei Minuten
    return slowDirSize(dir)
  }
  const monitor = createServerMonitor({ probe, dirs: DIRS, warnings: quietWarnings })
  await monitor.refreshSizes()
  assert.equal(probe.calls.dirSize.length, 3)
  probe.setNow(START + HOUR)
  await monitor.refreshSizes()
  assert.equal(probe.calls.dirSize.length, 6, 'eine Stunde nach dem Beginn neu')
})

test('scheduleServerMetrics: ein Fehler im Lauf wird eine Logzeile mit Code, nie ein Absturz', async () => {
  const { scheduleServerMetrics, setServerMonitorForTests } = require('../lib/serverMetrics')
  const lines = []
  const restore = setServerMonitorForTests({
    runHourly: () => {
      throw Object.assign(new Error(`EACCES ${DIRS.dataDir}`), { code: 'EACCES' })
    }
  })
  const { timer, firstRun } = scheduleServerMetrics({ logger: { warn: (line) => lines.push(line) } })
  try {
    await firstRun
    assert.deepEqual(lines, ['Server-Messung fehlgeschlagen (EACCES)'])
  } finally {
    clearInterval(timer)
    restore()
  }
})

test('Verlauf: eine Zeile aus der Zukunft (verstellte Uhr) hält die Messungen nicht auf', () => {
  db.prepare('DELETE FROM server_messwerte').run()
  const future = START + 5 * HOUR
  assert.equal(history.recordSample({ mem_used_pct: 1 }, { now: future }), true)
  assert.equal(history.recordSample({ mem_used_pct: 2 }, { now: START }), true, 'trotz jüngerer Zeile in der Zukunft')
  assert.equal(history.recordSample({ mem_used_pct: 3 }, { now: START + 10 * 60 * 1000 }), true, 'die neueste ist weiter die aus der Zukunft')
  db.prepare('DELETE FROM server_messwerte').run()
})

const test = require('node:test')
const { after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useTempDataDir } = require('./helpers')

// Phase N Task 1: Aufbewahrung der Anfragen - erledigte und abgelehnte 180 Tage nach dem Abschluss, offene
// 365 Tage nach dem Eingang. index.js startet den Lauf beim Hochfahren und danach alle 24 Stunden. Ohne Server.
const dataDir = useTempDataDir('anfragen-purge')

after(() => {
  const db = require('../db')
  if (db.open) db.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

test('purgeExpiredAnfragen: löscht nach den Fristen, lässt jüngere stehen', () => {
  const db = require('../db')
  const { purgeExpiredAnfragen, RETENTION_DAYS_CLOSED, RETENTION_DAYS_OPEN } = require('../lib/anfragen')
  assert.equal(RETENTION_DAYS_CLOSED, 180)
  assert.equal(RETENTION_DAYS_OPEN, 365)

  const insert = db.prepare(
    `INSERT INTO anfragen (typ, email, status, created_at, erledigt_at)
     VALUES ('gutschein', 'frist@example.org', ?, datetime('now', ?), CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', ?) END)`
  )
  const row = (status, createdDaysAgo, closedDaysAgo = null) =>
    Number(
      insert.run(status, `-${createdDaysAgo} days`, closedDaysAgo, closedDaysAgo === null ? null : `-${closedDaysAgo} days`).lastInsertRowid
    )

  const expired = [
    row('offen', 366),
    row('offen', 400),
    row('erledigt', 200, 181),
    row('abgelehnt', 400, 190),
    row('erledigt', 200) // ohne Abschluss-Zeitpunkt zählt der Eingang
  ]
  const kept = [
    row('offen', 364),
    row('offen', 1),
    row('erledigt', 400, 179), // lange offen, aber erst vor Kurzem erledigt
    row('abgelehnt', 10, 10),
    row('erledigt', 100)
  ]

  assert.equal(purgeExpiredAnfragen(), expired.length, 'gibt die Anzahl der gelöschten zurück')
  const remaining = db.prepare('SELECT id FROM anfragen ORDER BY id').all().map((r) => r.id)
  assert.deepEqual(remaining, kept)
  assert.equal(purgeExpiredAnfragen(), 0, 'ein zweiter Lauf findet nichts mehr')
})

test('runAnfragenPurge: loggt nur die Anzahl, nie Inhalte; ein Fehler reißt nichts mit', () => {
  const db = require('../db')
  const { runAnfragenPurge } = require('../lib/anfragen')
  const logged = []
  const logger = { log: (line) => logged.push(line), error: (line) => logged.push(line) }

  db.prepare(
    "INSERT INTO anfragen (typ, name, email, nachricht, created_at) VALUES ('gutschein', 'Geheim Name', 'geheim@example.org', 'Geheime Nachricht', datetime('now', '-400 days'))"
  ).run()
  assert.equal(runAnfragenPurge(logger), 1)
  assert.deepEqual(logged, ['Abgelaufene Anfragen gelöscht: 1'])
  assert.ok(!logged.join(' ').match(/Geheim|geheim@/))

  logged.length = 0
  assert.equal(runAnfragenPurge(logger), 0)
  assert.deepEqual(logged, [])

  db.close()
  assert.equal(runAnfragenPurge(logger), 0)
  assert.equal(logged.length, 1)
  assert.match(logged[0], /^Aufräumen der Anfragen fehlgeschlagen: /)
})

const test = require('node:test')
const { after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useTempDataDir } = require('./helpers')

// Phase N Task 1: Aufbewahrung der Anfragen - erledigte und abgelehnte 180 Tage nach dem Abschluss, offene 365 Tage
// nach der letzten Änderung (aktualisiert_at, sonst dem Eingang). index.js startet den Lauf beim Hochfahren und danach
// alle 24 Stunden - nur dort, nicht mehr bei jedem Eingang. Ohne Server.
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

  // Wieder geöffnet: eine alte Anfrage, die kürzlich bearbeitet wurde, bleibt - eine lange unbearbeitete nicht.
  const touched = db.prepare(
    "INSERT INTO anfragen (typ, email, status, created_at, aktualisiert_at) VALUES ('gutschein', 'frist@example.org', 'offen', datetime('now', '-400 days'), datetime('now', ?))"
  )
  expired.push(Number(touched.run('-366 days').lastInsertRowid))
  kept.push(Number(touched.run('-10 days').lastInsertRowid))

  assert.equal(purgeExpiredAnfragen(), expired.length, 'gibt die Anzahl der gelöschten zurück')
  const remaining = db.prepare('SELECT id FROM anfragen ORDER BY id').all().map((r) => r.id)
  assert.deepEqual(remaining, kept)
  assert.equal(purgeExpiredAnfragen(), 0, 'ein zweiter Lauf findet nichts mehr')
})

test('insertAnfrage: räumt nicht mehr auf; ab 1000 offenen still verworfen, eine Logzeile je Stunde mit der Anzahl', () => {
  const db = require('../db')
  const { insertAnfrage, MAX_OPEN_ANFRAGEN } = require('../lib/anfragen')
  assert.equal(MAX_OPEN_ANFRAGEN, 1000)
  const clean = (email) => ({ typ: 'gutschein', name: null, email, nachricht: null, firma: null, partner_typ: null, plz: null })
  const lines = []
  const logger = { warn: (line) => lines.push(line) }
  const HOUR = 60 * 60 * 1000
  let clock = Date.UTC(2026, 8, 29, 12, 0, 0)
  const options = () => ({ logger, now: clock })

  db.prepare("INSERT INTO anfragen (typ, email, created_at) VALUES ('gutschein', 'uralt@example.org', datetime('now', '-400 days'))").run()
  assert.equal(insertAnfrage(clean('neu@example.org'), options()).created, true)
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM anfragen WHERE email = 'uralt@example.org'").get().n, 1, 'der Eingang löscht nichts')
  db.prepare('DELETE FROM anfragen').run()

  const insert = db.prepare("INSERT INTO anfragen (typ, email) VALUES ('gutschein', ?)")
  db.transaction(() => {
    for (let i = 0; i < 1000; i += 1) insert.run(`offen-${i}@example.org`)
  })()
  assert.deepEqual(insertAnfrage(clean('a@example.org'), options()), { created: false })
  assert.deepEqual(lines, ['Neue Anfragen verworfen (schon 1000 offene) – seit der letzten Meldung: 1'])
  insertAnfrage(clean('b@example.org'), options())
  clock += 30 * 60 * 1000
  insertAnfrage(clean('c@example.org'), options())
  assert.equal(lines.length, 1, 'höchstens eine Zeile je Stunde')
  clock += HOUR
  insertAnfrage(clean('d@example.org'), options())
  assert.deepEqual(lines.at(-1), 'Neue Anfragen verworfen (schon 1000 offene) – seit der letzten Meldung: 3')
  assert.ok(!lines.join(' ').includes('@'), 'keine Adressen im Log')
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM anfragen').get().n, 1000)

  db.prepare("UPDATE anfragen SET status = 'erledigt' WHERE id = (SELECT MIN(id) FROM anfragen)").run()
  assert.equal(insertAnfrage(clean('e@example.org'), options()).created, true, 'unter der Grenze wieder möglich')
  db.prepare('DELETE FROM anfragen').run()
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

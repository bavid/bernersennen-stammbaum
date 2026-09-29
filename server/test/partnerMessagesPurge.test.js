const test = require('node:test')
const { after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useTempDataDir } = require('./helpers')

// Phase P2 (security-review, Medium): Kontaktnachrichten verschwinden nach 180 Tagen auch dann, wenn ein
// Partner seinen Posteingang nie öffnet - purgeAllExpiredMessages() räumt über alle Partner auf (index.js
// ruft sie beim Start und danach alle 24 Stunden auf). Ohne Server: nur die Funktion selbst.
const dataDir = useTempDataDir('partner-messages-purge')

after(() => {
  const db = require('../db')
  if (db.open) db.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

test('purgeAllExpiredMessages: alte Nachrichten aller Partner weg, neuere bleiben', () => {
  const db = require('../db')
  const { purgeAllExpiredMessages, RETENTION_DAYS } = require('../lib/partnerMessages')
  assert.equal(RETENTION_DAYS, 180)

  const insert = db.prepare(
    "INSERT INTO partner_messages (partner_id, email, nachricht, created_at) VALUES (?, 'absender@example.org', ?, datetime('now', ?))"
  )
  const aged = (partnerId, days) => Number(insert.run(partnerId, `Nachricht vor ${days} Tagen`, `-${days} days`).lastInsertRowid)
  const expired = [aged(1, 181), aged(2, 200), aged(3, 400), aged(2, 180.5)]
  const kept = [aged(1, 179), aged(2, 10), aged(3, 0), aged(4, 179.9)]

  assert.equal(purgeAllExpiredMessages(), expired.length, 'gibt die Anzahl der gelöschten Nachrichten zurück')

  const remaining = db.prepare('SELECT id FROM partner_messages ORDER BY id').all().map((row) => row.id)
  assert.deepEqual(remaining, kept)
  assert.equal(purgeAllExpiredMessages(), 0, 'ein zweiter Lauf findet nichts mehr')
})

// Admin-Ansicht (nur lesen): das Öffnen eines Posteingangs darf nichts löschen - dafür gibt es den täglichen Lauf.
test('listMessages: purge:false lässt abgelaufene Nachrichten stehen, Standard räumt den eigenen Partner auf', () => {
  const db = require('../db')
  const { listMessages } = require('../lib/partnerMessages')
  const insert = db.prepare(
    "INSERT INTO partner_messages (partner_id, email, nachricht, created_at) VALUES (?, 'absender@example.org', ?, datetime('now', ?))"
  )
  insert.run(9, 'alt', '-200 days')
  insert.run(9, 'neu', '-1 days')

  // Die Liste selbst zeigt Abgelaufenes nie - entscheidend ist, ob die Zeile in der Datenbank bleibt.
  const count = () => db.prepare('SELECT COUNT(*) AS n FROM partner_messages WHERE partner_id = 9').get().n
  listMessages(9, { purge: false })
  assert.equal(count(), 2, 'nur lesen: die alte Nachricht bleibt in der Datenbank')
  listMessages(9)
  assert.equal(count(), 1, 'normaler Aufruf: die alte Nachricht ist gelöscht')
  db.prepare('DELETE FROM partner_messages WHERE partner_id = 9').run()
})

test('runMessagePurge: loggt nur die Anzahl, nie Inhalte; ein Fehler reißt nichts mit', () => {
  const db = require('../db')
  const { runMessagePurge } = require('../lib/partnerMessages')
  const logged = []
  const logger = { log: (line) => logged.push(line), error: (line) => logged.push(line) }

  db.prepare(
    "INSERT INTO partner_messages (partner_id, name, email, nachricht, created_at) VALUES (7, 'Geheim Name', 'geheim@example.org', 'Geheimer Inhalt der Nachricht', datetime('now', '-200 days'))"
  ).run()
  assert.equal(runMessagePurge(logger), 1)
  assert.deepEqual(logged, ['Kontaktnachrichten älter als 180 Tage gelöscht: 1'])
  assert.ok(!logged.join(' ').match(/Geheim|geheim@/), 'keine Inhalte oder Kontaktdaten im Log')

  logged.length = 0
  assert.equal(runMessagePurge(logger), 0)
  assert.deepEqual(logged, [], 'nichts zu löschen -> keine Logzeile')

  // Geschlossene Datenbank: der Lauf wirft nicht, er meldet nur den Fehler.
  db.close()
  assert.equal(runMessagePurge(logger), 0)
  assert.equal(logged.length, 1)
  assert.match(logged[0], /^Aufräumen der Kontaktnachrichten fehlgeschlagen: /)
})

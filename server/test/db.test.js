const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const testDbPath = path.join(__dirname, 'db.test.tmp.db')
process.env.DB_PATH = testDbPath

const db = require('../db')

test.after(() => {
  db.close()
  for (const suffix of ['', '-wal', '-shm']) {
    const file = testDbPath + suffix
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }
})

test('creates all expected tables', () => {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name)

  assert.ok(rows.includes('families'))
  assert.ok(rows.includes('dogs'))
  assert.ok(rows.includes('timeline_entries'))
  assert.ok(rows.includes('breeding_events'))
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useTempDataDir } = require('./helpers')

const dataDir = useTempDataDir('darstellung-migration')

// Review B+ (L6): eine Datenbank aus der Zeit vor dem Mini-Designer (home_darstellung mit nur palette/modus/schrift) bekommt
// beim ersten require von lib/darstellung.js die neuen Spalten mit ihren Vorgaben - gespeicherte Werte bleiben, die alte
// Palette „terrakotta“ liest sich als „familienalbum“.
test('Migration: alte home_darstellung bekommt akzent, schriftart, handschrift und ecken', (t) => {
  const db = require('../db')
  t.after(() => {
    db.close()
    fs.rmSync(dataDir, { recursive: true, force: true })
  })
  db.exec(`
    DROP TABLE IF EXISTS home_darstellung;
    CREATE TABLE home_darstellung (
      family_id INTEGER PRIMARY KEY,
      palette TEXT NOT NULL,
      modus TEXT NOT NULL,
      schrift TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO home_darstellung (family_id, palette, modus, schrift) VALUES (1, 'terrakotta', 'dunkel', 'gross');
    INSERT INTO home_darstellung (family_id, palette, modus, schrift) VALUES (2, 'wald', 'hell', 'normal');
  `)

  const { loadDarstellung } = require('../lib/darstellung')
  const columns = db.prepare('PRAGMA table_info(home_darstellung)').all().map((column) => column.name)
  for (const column of ['akzent', 'schriftart', 'handschrift', 'ecken']) assert.ok(columns.includes(column), column)

  assert.deepEqual(loadDarstellung(1), {
    palette: 'familienalbum',
    modus: 'dunkel',
    schrift: 'gross',
    akzent: '',
    schriftart: 'klassisch',
    handschrift: 'an',
    ecken: 'weich'
  })
  assert.equal(loadDarstellung(2).palette, 'wald')

  // Ein zweites Laden ändert nichts (die Spalten sind schon da).
  delete require.cache[require.resolve('../lib/darstellung')]
  assert.doesNotThrow(() => require('../lib/darstellung'))
})

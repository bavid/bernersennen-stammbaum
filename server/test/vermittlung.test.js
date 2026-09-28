const test = require('node:test')
const assert = require('node:assert/strict')
const {
  VERMITTLUNG_STATUS,
  PUBLISHABLE_STATUS,
  LISTED_STATUS,
  statusInSql,
  publishableSql,
  listedSql
} = require('../lib/vermittlung')

// Phase P Task 1: lib/vermittlung.js ist die einzige Quelle für die Vermittlungsstatus-Listen.

test('Status-Listen: pausiert ist veröffentlichbar, aber nicht gelistet', () => {
  assert.deepEqual([...VERMITTLUNG_STATUS], ['in_vermittlung', 'reserviert', 'pausiert', 'vermittelt'])
  assert.deepEqual([...PUBLISHABLE_STATUS], ['in_vermittlung', 'reserviert', 'pausiert'])
  assert.deepEqual([...LISTED_STATUS], ['in_vermittlung', 'reserviert'])
  assert.ok(Object.isFrozen(VERMITTLUNG_STATUS) && Object.isFrozen(PUBLISHABLE_STATUS) && Object.isFrozen(LISTED_STATUS))
  assert.ok(LISTED_STATUS.every((status) => PUBLISHABLE_STATUS.includes(status)))
  assert.ok(PUBLISHABLE_STATUS.every((status) => VERMITTLUNG_STATUS.includes(status)))
})

test('statusInSql baut die IN-Liste aus der Konstante', () => {
  assert.equal(statusInSql(LISTED_STATUS, 'd.vermittlung_status'), "d.vermittlung_status IN ('in_vermittlung', 'reserviert')")
  assert.equal(
    statusInSql(PUBLISHABLE_STATUS, '@vermittlung_status'),
    "@vermittlung_status IN ('in_vermittlung', 'reserviert', 'pausiert')"
  )
})

test('publishableSql/listedSql mit und ohne Tabellen-Alias', () => {
  assert.equal(publishableSql(), "vermittlung_status IN ('in_vermittlung', 'reserviert', 'pausiert')")
  assert.equal(publishableSql('d'), "d.vermittlung_status IN ('in_vermittlung', 'reserviert', 'pausiert')")
  assert.equal(listedSql('dogs'), "dogs.vermittlung_status IN ('in_vermittlung', 'reserviert')")
})

test('statusInSql lehnt unbekannte Status und unsichere Spaltenausdrücke ab', () => {
  assert.throws(() => statusInSql(['in_vermittlung', "x') OR 1=1 --"], 'vermittlung_status'), /Vermittlungsstatus/)
  assert.throws(() => statusInSql([], 'vermittlung_status'), /Vermittlungsstatus/)
  assert.throws(() => statusInSql(LISTED_STATUS, 'vermittlung_status; DROP TABLE dogs'), /Spalte/)
  assert.throws(() => publishableSql('d OR 1=1'), /Spalte/)
})

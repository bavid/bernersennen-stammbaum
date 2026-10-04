const test = require('node:test')
const assert = require('node:assert/strict')
const { berlinToday, relativeDemoDate } = require('../lib/demoDates')

// Review B+ (L7): die „Heute vor einem Jahr“-Erinnerungen der Demo rechnen in Europe/Berlin, wie die Geräte der Familien.
test('berlinToday: kurz nach Mitternacht in Berlin ist dort schon morgen (UTC noch gestern)', () => {
  assert.deepEqual(berlinToday(new Date('2026-10-03T22:30:00Z')), { year: 2026, month: 10, day: 4 })
  assert.deepEqual(berlinToday(new Date('2026-01-15T23:30:00Z')), { year: 2026, month: 1, day: 16 })
  assert.deepEqual(berlinToday(new Date('2026-10-04T12:00:00Z')), { year: 2026, month: 10, day: 4 })
})

test('relativeDemoDate: Tage nach heute, Jahre früher - über Monats- und Jahresgrenzen', () => {
  const now = new Date('2026-10-04T08:00:00Z')
  assert.equal(relativeDemoDate({ years: 1 }, now), '2025-10-04')
  assert.equal(relativeDemoDate({ days: 1, years: 2 }, now), '2024-10-05')
  assert.equal(relativeDemoDate({ days: 3, years: 3 }, new Date('2026-12-30T08:00:00Z')), '2024-01-02')
  assert.equal(relativeDemoDate({}, new Date('2026-10-03T22:30:00Z')), '2026-10-04')
})

test('relativeDemoDate: aus einem 29. Februar wird in einem Jahr ohne ihn der 28.', () => {
  assert.equal(relativeDemoDate({ years: 1 }, new Date('2028-02-29T10:00:00Z')), '2027-02-28')
  assert.equal(relativeDemoDate({ years: 4 }, new Date('2028-02-29T10:00:00Z')), '2024-02-29')
  assert.equal(relativeDemoDate({ days: 1, years: 1 }, new Date('2028-02-28T10:00:00Z')), '2027-02-28')
})

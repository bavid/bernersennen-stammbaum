const test = require('node:test')
const assert = require('node:assert/strict')
const {
  SERIE,
  addDays,
  addYears,
  weekdayOf,
  nthWeekdayOf,
  maxSerieBis,
  expandTermin,
  isOccurrence,
  isUpcoming,
  berlinNow
} = require('../lib/terminSerien')

// V4a: Serien der Partner-Termine - reine Datumsrechnung auf JJJJ-MM-TT (UTC-Datum, keine Uhrzeit, keine Zeitzone).
// Keine Datenbank: das Modul ist pur. t.test() bleibt auf einer Ebene.

const dates = (list) => list.map((item) => item.datum)

test('Datumsrechnung: Tage, Jahre, Wochentag und n-ter Wochentag', async (t) => {
  await t.test('addDays über Monats-, Jahres- und Sommerzeitgrenzen', () => {
    assert.equal(addDays('2026-10-24', 7), '2026-10-31')
    assert.equal(addDays('2026-10-31', 1), '2026-11-01')
    assert.equal(addDays('2026-12-31', 1), '2027-01-01')
    // Ende der Sommerzeit (25.10.2026) und Beginn (28.03.2027) spielen keine Rolle.
    assert.equal(addDays('2026-10-24', 1), '2026-10-25')
    assert.equal(addDays('2027-03-27', 1), '2027-03-28')
    assert.equal(addDays('2028-02-28', 1), '2028-02-29')
    assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  })

  await t.test('addYears klemmt den 29. Februar auf den 28.', () => {
    assert.equal(addYears('2026-10-10', 1), '2027-10-10')
    assert.equal(addYears('2028-02-29', 1), '2029-02-28')
    assert.equal(addYears('2026-01-31', 2), '2028-01-31')
  })

  await t.test('weekdayOf: 0 = Sonntag, 6 = Samstag', () => {
    assert.equal(weekdayOf('2026-10-03'), 6)
    assert.equal(weekdayOf('2026-10-04'), 0)
    assert.equal(weekdayOf('2026-10-05'), 1)
  })

  await t.test('nthWeekdayOf: der wievielte dieses Wochentags im Monat', () => {
    assert.equal(nthWeekdayOf('2026-10-03'), 1)
    assert.equal(nthWeekdayOf('2026-10-10'), 2)
    assert.equal(nthWeekdayOf('2026-10-31'), 5)
  })

  await t.test('maxSerieBis: höchstens ein Jahr nach dem ersten Termin', () => {
    assert.equal(maxSerieBis('2026-10-10'), '2027-10-10')
  })
})

test('Serien aufklappen', async (t) => {
  const window = { von: '2026-01-01', bis: '2028-12-31' }

  await t.test('einzelner Termin: genau ein Datum, im Zeitfenster', () => {
    const termin = { datum: '2026-10-10', serie: SERIE.keine, serie_bis: null }
    assert.deepEqual(dates(expandTermin(termin, window)), ['2026-10-10'])
    assert.deepEqual(expandTermin(termin, { von: '2026-10-11', bis: '2026-12-31' }), [])
  })

  await t.test('wöchentlich bis einschließlich serie_bis', () => {
    const termin = { datum: '2026-10-03', serie: SERIE.woechentlich, serie_bis: '2026-10-31' }
    assert.deepEqual(dates(expandTermin(termin, window)), ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31'])
  })

  await t.test('alle zwei Wochen', () => {
    const termin = { datum: '2026-10-03', serie: SERIE.zweiwoechentlich, serie_bis: '2026-11-14' }
    assert.deepEqual(dates(expandTermin(termin, window)), ['2026-10-03', '2026-10-17', '2026-10-31', '2026-11-14'])
  })

  await t.test('das Zeitfenster schneidet vorn und hinten ab', () => {
    const termin = { datum: '2026-10-03', serie: SERIE.woechentlich, serie_bis: '2026-12-26' }
    assert.deepEqual(dates(expandTermin(termin, { von: '2026-10-15', bis: '2026-11-01' })), ['2026-10-17', '2026-10-24', '2026-10-31'])
  })

  await t.test('jeden 2. Samstag im Monat', () => {
    const termin = { datum: '2026-10-10', serie: SERIE.monatlichWochentag, serie_bis: '2027-02-28' }
    assert.deepEqual(dates(expandTermin(termin, window)), ['2026-10-10', '2026-11-14', '2026-12-12', '2027-01-09', '2027-02-13'])
  })

  await t.test('jeden 5. Samstag: Monate ohne fünften Samstag fallen weg', () => {
    const termin = { datum: '2026-10-31', serie: SERIE.monatlichWochentag, serie_bis: '2027-05-31' }
    // Nov 2026 bis April 2027 haben keinen 5. Samstag, der Januar 2027 schon (30.01.), der Mai 2027 auch (29.05.).
    assert.deepEqual(dates(expandTermin(termin, window)), ['2026-10-31', '2027-01-30', '2027-05-29'])
  })

  await t.test('monatlich am 31.: Monate ohne 31. fallen weg', () => {
    const termin = { datum: '2026-10-31', serie: SERIE.monatlichTag, serie_bis: '2027-03-31' }
    assert.deepEqual(dates(expandTermin(termin, window)), ['2026-10-31', '2026-12-31', '2027-01-31', '2027-03-31'])
  })

  await t.test('monatlich am 15. über den Jahreswechsel', () => {
    const termin = { datum: '2026-11-15', serie: SERIE.monatlichTag, serie_bis: '2027-02-15' }
    assert.deepEqual(dates(expandTermin(termin, window)), ['2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15'])
  })

  await t.test('nie mehr als ein Jahr - auch wenn serie_bis später steht oder fehlt', () => {
    const later = { datum: '2026-10-03', serie: SERIE.woechentlich, serie_bis: '2029-01-01' }
    const items = expandTermin(later, window)
    assert.equal(items.at(-1).datum, '2027-10-02')
    assert.equal(items.length, 53)
    const open = { datum: '2026-10-03', serie: SERIE.woechentlich, serie_bis: null }
    assert.equal(expandTermin(open, window).at(-1).datum, '2027-10-02')
  })

  await t.test('Jahresgrenze: derselbe Kalendertag im Folgejahr zählt noch, ein Tag später nicht', () => {
    // Monatlich am 15.: der 15.10.2027 ist genau "ein Jahr" - der 13. Termin gehört dazu.
    const monthly = { datum: '2026-10-15', serie: SERIE.monatlichTag, serie_bis: null }
    const items = dates(expandTermin(monthly, window))
    assert.equal(items.length, 13)
    assert.equal(items.at(-1), '2027-10-15')
    assert.equal(maxSerieBis('2026-10-15'), '2027-10-15')
    // serie_bis einen Tag nach der Grenze wird auf die Grenze gekappt, einen Tag davor endet die Serie davor.
    assert.equal(dates(expandTermin({ ...monthly, serie_bis: '2027-10-16' }, window)).at(-1), '2027-10-15')
    assert.equal(dates(expandTermin({ ...monthly, serie_bis: '2027-10-14' }, window)).at(-1), '2027-09-15')
    // Wöchentlich ab Samstag, 03.10.2026: der 03.10.2027 ist ein Sonntag - letzter Termin 02.10.2027, 53 Termine.
    const weekly = dates(expandTermin({ datum: '2026-10-03', serie: SERIE.woechentlich, serie_bis: null }, window))
    assert.deepEqual([weekly.length, weekly.at(-1)], [53, '2027-10-02'])
    // Über einen Schalttag: 29.02.2028 -> 28.02.2029.
    assert.equal(maxSerieBis('2028-02-29'), '2029-02-28')
  })

  await t.test('abgesagte Termine bleiben in der Liste, markiert', () => {
    const termin = { datum: '2026-10-03', serie: SERIE.woechentlich, serie_bis: '2026-10-24' }
    const items = expandTermin(termin, { ...window, absagen: ['2026-10-10', '2026-10-12'] })
    assert.deepEqual(items, [
      { datum: '2026-10-03', abgesagt: false },
      { datum: '2026-10-10', abgesagt: true },
      { datum: '2026-10-17', abgesagt: false },
      { datum: '2026-10-24', abgesagt: false }
    ])
  })

  await t.test('unbekannte Serie liefert nichts', () => {
    assert.deepEqual(expandTermin({ datum: '2026-10-03', serie: 'taeglich', serie_bis: null }, window), [])
  })

  await t.test('isOccurrence: nur echte Termine der Serie', () => {
    const termin = { datum: '2026-10-10', serie: SERIE.monatlichWochentag, serie_bis: '2027-10-10' }
    assert.equal(isOccurrence(termin, '2026-11-14'), true)
    assert.equal(isOccurrence(termin, '2026-11-07'), false)
    assert.equal(isOccurrence(termin, '2026-10-03'), false)
    assert.equal(isOccurrence(termin, '2027-10-09'), true)
    assert.equal(isOccurrence(termin, 'kein-datum'), false)
  })
})

test('Was noch kommt, und "jetzt" in Berlin', async (t) => {
  const now = { datum: '2026-10-10', zeit: '11:30' }

  await t.test('isUpcoming: später am Tag oder an einem späteren Tag', () => {
    assert.equal(isUpcoming({ datum: '2026-10-11', uhrzeit: '09:00', ende: null }, now), true)
    assert.equal(isUpcoming({ datum: '2026-10-09', uhrzeit: '18:00', ende: null }, now), false)
    assert.equal(isUpcoming({ datum: '2026-10-10', uhrzeit: '12:00', ende: null }, now), true)
    assert.equal(isUpcoming({ datum: '2026-10-10', uhrzeit: '10:00', ende: null }, now), false)
    // Läuft noch (Ende nach jetzt) - zählt noch.
    assert.equal(isUpcoming({ datum: '2026-10-10', uhrzeit: '10:00', ende: '12:00' }, now), true)
  })

  await t.test('berlinNow: Sommer- und Winterzeit', () => {
    assert.deepEqual(berlinNow(new Date('2026-10-03T22:30:00Z')), { datum: '2026-10-04', zeit: '00:30' })
    assert.deepEqual(berlinNow(new Date('2026-12-31T23:30:00Z')), { datum: '2027-01-01', zeit: '00:30' })
    assert.deepEqual(berlinNow(new Date('2026-12-31T10:05:00Z')), { datum: '2026-12-31', zeit: '11:05' })
  })
})

const test = require('node:test')
const assert = require('node:assert/strict')
const { MAX_ZEITRAEUME, validateZeitraeume, parseZeitraeume, upcomingZeitraeume } = require('../lib/promotionZeitraeume')

// Phase V4a: mehrere Termine je Anzeige (promotions.zeitraeume, JSON) - Prüfung, Lesen und "nur kommende".
// Pur, ohne Datenbank. t.test() bleibt auf einer Ebene.

const TODAY = '2026-10-03'
const errorOf = (fn) => {
  try {
    fn()
  } catch (err) {
    return { status: err.status, message: err.message }
  }
  return null
}

test('Zeiträume einer Anzeige prüfen', async (t) => {
  await t.test('nichts angegeben -> null', () => {
    assert.equal(validateZeitraeume(undefined, { today: TODAY }), null)
    assert.equal(validateZeitraeume(null, { today: TODAY }), null)
    assert.equal(validateZeitraeume([], { today: TODAY }), null)
  })

  await t.test('einzelne Tage und von-bis, sortiert, doppelte einmal, bis = von wird ein Tag', () => {
    const clean = validateZeitraeume(
      [
        { von: '2027-05-05', bis: '2027-05-10' },
        { von: '2027-01-01' },
        { von: '2027-03-01', bis: '' },
        { von: '2027-02-01', bis: '2027-02-01' },
        { von: '2027-01-01', bis: null }
      ],
      { today: TODAY }
    )
    assert.deepEqual(clean, [
      { von: '2027-01-01', bis: null },
      { von: '2027-02-01', bis: null },
      { von: '2027-03-01', bis: null },
      { von: '2027-05-05', bis: '2027-05-10' }
    ])
  })

  await t.test('Fehler: keine Liste, zu viele, ungültig, Ende vor Beginn, zu lang, zu weit voraus', () => {
    const cases = [
      ['2027-01-01', 'Die Termine müssen eine Liste sein'],
      [Array.from({ length: MAX_ZEITRAEUME + 1 }, (_, i) => ({ von: `2027-01-${String(i + 1).padStart(2, '0')}` })), 'Höchstens 12 Termine je Beitrag'],
      [['2027-01-01'], 'Termin 1: bitte ein gültiges Datum angeben (JJJJ-MM-TT)'],
      [[{ von: '2027-01-01' }, { von: '2027-02-30' }], 'Termin 2: bitte ein gültiges Datum angeben (JJJJ-MM-TT)'],
      [[{ von: '2027-01-01', bis: 'morgen' }], 'Termin 1: bitte ein gültiges Datum angeben (JJJJ-MM-TT)'],
      [[{ von: '2027-01-10', bis: '2027-01-09' }], 'Termin 1: das Ende darf nicht vor dem Beginn liegen'],
      [[{ von: '2027-01-10', bis: '2027-03-12' }], 'Termin 1: ein Zeitraum dauert höchstens 60 Tage'],
      [[{ von: '2028-10-04' }], 'Termin 1: höchstens zwei Jahre im Voraus']
    ]
    for (const [value, message] of cases) {
      assert.deepEqual(errorOf(() => validateZeitraeume(value, { today: TODAY })), { status: 400, message }, JSON.stringify(value).slice(0, 60))
    }
  })

  await t.test('vergangene Termine dürfen stehen bleiben (ein älterer Beitrag wird bearbeitet)', () => {
    assert.deepEqual(validateZeitraeume([{ von: '2026-01-01' }], { today: TODAY }), [{ von: '2026-01-01', bis: null }])
  })
})

test('Zeiträume lesen und filtern', async (t) => {
  await t.test('parseZeitraeume: kaputte oder fremde Werte werden zur leeren Liste', () => {
    assert.deepEqual(parseZeitraeume(null), [])
    assert.deepEqual(parseZeitraeume('kein json'), [])
    assert.deepEqual(parseZeitraeume('{"von":"2027-01-01"}'), [])
    assert.deepEqual(parseZeitraeume('[{"von":"2027-01-01","bis":null},{"von":"x"},{"von":"2027-02-01","bis":"2027-02-03"}]'), [
      { von: '2027-01-01', bis: null },
      { von: '2027-02-01', bis: '2027-02-03' }
    ])
  })

  await t.test('upcomingZeitraeume: nur, was heute oder später noch läuft', () => {
    const list = [
      { von: '2026-09-01', bis: null },
      { von: '2026-10-01', bis: '2026-10-05' },
      { von: '2026-10-03', bis: null },
      { von: '2026-11-01', bis: null }
    ]
    assert.deepEqual(upcomingZeitraeume(list, TODAY), list.slice(1))
  })
})

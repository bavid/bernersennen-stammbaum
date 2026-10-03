import { describe, expect, test } from 'vitest'
import {
  addMonths,
  formatTagKurz,
  formatUhrzeit,
  groupByMonth,
  initialTerminForm,
  maxSerieBis,
  naechsterTerminText,
  serieLabel,
  serieOptions,
  serieSkipsMonths,
  splitByHorizon,
  splitSerien,
  terminClientErrors,
  terminErrorField,
  toTerminPayload
} from './termine.js'

const TODAY = '2026-10-03'

describe('Termine anzeigen', () => {
  test('formatTagKurz: Wochentag, Tag und Monat ohne führende Nullen', () => {
    expect(formatTagKurz('2026-10-10')).toBe('Sa, 10.10.')
    expect(formatTagKurz('2026-11-01')).toBe('So, 1.11.')
    expect(formatTagKurz('kein-datum')).toBe('')
  })

  test('formatUhrzeit: mit und ohne Ende', () => {
    expect(formatUhrzeit('10:00', '11:30')).toBe('10:00–11:30 Uhr')
    expect(formatUhrzeit('18:00', null)).toBe('18:00 Uhr')
  })

  test('naechsterTerminText wie auf der Karte in Entdecken', () => {
    expect(naechsterTerminText({ datum: '2026-10-10', uhrzeit: '10:00', titel: 'Welpenspielstunde' })).toBe('Sa, 10.10., 10:00 · Welpenspielstunde')
    expect(naechsterTerminText(null)).toBe('')
  })

  test('serieLabel nennt die Regel aus dem ersten Termin', () => {
    expect(serieLabel('keine', '2026-10-10')).toBe('Einmalig')
    expect(serieLabel('woechentlich', '2026-10-10')).toBe('Jeden Samstag')
    expect(serieLabel('zweiwoechentlich', '2026-10-11')).toBe('Alle zwei Wochen am Sonntag')
    expect(serieLabel('monatlich_wochentag', '2026-10-10')).toBe('Jeden 2. Samstag im Monat')
    expect(serieLabel('monatlich_tag', '2026-10-31')).toBe('Jeden Monat am 31.')
    expect(serieLabel('monatlich_tag', '')).toBe('Jeden Monat am selben Tag')
    expect(serieLabel('unbekannt', '2026-10-10')).toBe('')
  })

  test('serieSkipsMonths: am 29.-31. oder am 5. Wochentag fallen Monate aus', () => {
    expect(serieSkipsMonths('monatlich_tag', '2026-10-31')).toBe(true)
    expect(serieSkipsMonths('monatlich_tag', '2026-10-28')).toBe(false)
    expect(serieSkipsMonths('monatlich_wochentag', '2026-10-31')).toBe(true)
    expect(serieSkipsMonths('monatlich_wochentag', '2026-10-24')).toBe(false)
    expect(serieSkipsMonths('woechentlich', '2026-10-31')).toBe(false)
  })

  test('serieOptions: alle fünf Wiederholungen, passend zum Datum beschriftet', () => {
    expect(serieOptions('2026-10-10').map((option) => option.value)).toEqual([
      'keine',
      'woechentlich',
      'zweiwoechentlich',
      'monatlich_wochentag',
      'monatlich_tag'
    ])
    expect(serieOptions('').find((option) => option.value === 'monatlich_wochentag').label).toBe('Jeden n. Wochentag im Monat')
  })

  test('groupByMonth: Abschnitte je Monat, in Reihenfolge', () => {
    const items = [{ datum: '2026-10-10' }, { datum: '2026-10-17' }, { datum: '2026-11-14' }, { datum: '2027-01-09' }]
    expect(groupByMonth(items).map(({ key, label, items: list }) => [key, label, list.length])).toEqual([
      ['2026-10', 'Oktober 2026', 2],
      ['2026-11', 'November 2026', 1],
      ['2027-01', 'Januar 2027', 1]
    ])
  })

  // Audit V7a: im Partner-Bereich steht jede Serie einmal (mit ihren Tagen zum Aufklappen), Einzeltermine nach Monat.
  test('splitSerien: Serien je Termin in Reihenfolge des ersten Vorkommens, dazu die Einzeltermine', () => {
    const items = [
      { terminId: 1, serie: 'woechentlich', datum: '2026-10-10' },
      { terminId: 2, serie: 'keine', datum: '2026-10-12' },
      { terminId: 3, serie: 'monatlich_tag', datum: '2026-10-14' },
      { terminId: 1, serie: 'woechentlich', datum: '2026-10-17', abgesagt: true },
      { terminId: 1, serie: 'woechentlich', datum: '2026-10-24' },
      { terminId: 3, serie: 'monatlich_tag', datum: '2026-11-14' }
    ]
    const { serien, einzeln } = splitSerien(items)
    expect(serien.map(({ terminId, items: list }) => [terminId, list.map((item) => item.datum)])).toEqual([
      [1, ['2026-10-10', '2026-10-17', '2026-10-24']],
      [3, ['2026-10-14', '2026-11-14']]
    ])
    expect(serien[0].naechster.datum).toBe('2026-10-10')
    expect(serien[0].abgesagt).toBe(1)
    expect(einzeln.map((item) => item.terminId)).toEqual([2])
    // Fällt der nächste Tag aus, ist der nächste stattfindende der "nächste Termin"; fallen alle aus, der erste.
    const cancelledFirst = splitSerien([
      { terminId: 1, serie: 'woechentlich', datum: '2026-10-10', abgesagt: true },
      { terminId: 1, serie: 'woechentlich', datum: '2026-10-17' }
    ]).serien[0]
    expect(cancelledFirst.naechster.datum).toBe('2026-10-17')
    const allCancelled = splitSerien([{ terminId: 1, serie: 'woechentlich', datum: '2026-10-10', abgesagt: true }]).serien[0]
    expect(allCancelled.naechster.datum).toBe('2026-10-10')
    expect(splitSerien([])).toEqual({ serien: [], einzeln: [] })
  })

  test('addMonths klemmt auf das Monatsende', () => {
    expect(addMonths('2026-10-03', 3)).toBe('2027-01-03')
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28')
    expect(maxSerieBis('2028-02-29')).toBe('2029-02-28')
  })

  test('splitByHorizon: die nächsten Monate zuerst, der Rest auf Wunsch', () => {
    const items = [{ datum: '2026-10-10' }, { datum: '2027-01-03' }, { datum: '2027-01-04' }]
    expect(splitByHorizon(items, TODAY, 3)).toEqual({ sichtbar: items.slice(0, 2), spaeter: items.slice(2) })
  })
})

describe('Termin-Formular', () => {
  test('initialTerminForm: leer oder aus einem Termin', () => {
    expect(initialTerminForm(null)).toEqual({ titel: '', text: '', ort: '', datum: '', uhrzeit: '', ende: '', serie: 'keine', serieBis: '' })
    const termin = { titel: 'Social Walk', text: null, ort: 'Stadtpark', datum: '2026-10-11', uhrzeit: '11:00', ende: null, serie: 'monatlich_wochentag', serieBis: '2027-10-11' }
    expect(initialTerminForm(termin)).toEqual({ ...termin, text: '', ende: '' })
  })

  test('toTerminPayload: getrimmt, leere Felder als null, ohne Serie kein Serien-Ende', () => {
    const form = { titel: ' Kurs ', text: '  ', ort: ' Platz ', datum: '2026-10-10', uhrzeit: '10:00', ende: '', serie: 'keine', serieBis: '2026-12-01' }
    expect(toTerminPayload(form)).toEqual({ titel: 'Kurs', text: null, ort: 'Platz', datum: '2026-10-10', uhrzeit: '10:00', ende: null, serie: 'keine', serieBis: null })
    expect(toTerminPayload({ ...form, serie: 'woechentlich' }).serieBis).toBe('2026-12-01')
  })

  test('terminClientErrors: dieselben Regeln und Meldungen wie der Server', () => {
    const valid = { titel: 'Kurs', text: '', ort: '', datum: '2026-10-10', uhrzeit: '10:00', ende: '11:00', serie: 'woechentlich', serieBis: '' }
    expect(terminClientErrors(valid, { today: TODAY })).toEqual({})
    expect(terminClientErrors({ ...valid, titel: ' ' }, { today: TODAY })).toEqual({ titel: 'Der Titel ist Pflicht' })
    expect(terminClientErrors({ ...valid, text: 'siehe https://example.org' }, { today: TODAY }).text).toMatch(/reinen Text/)
    expect(terminClientErrors({ ...valid, ort: 'hundeschule-beispiel.de' }, { today: TODAY }).ort).toMatch(/reinen Text/)
    expect(terminClientErrors({ ...valid, text: 'z. B. Leine mitbringen, ca. 1,5 Std.' }, { today: TODAY })).toEqual({})
    expect(terminClientErrors({ ...valid, datum: '' }, { today: TODAY }).datum).toBe('Bitte ein gültiges Datum angeben (JJJJ-MM-TT).')
    expect(terminClientErrors({ ...valid, datum: '2026-10-02' }, { today: TODAY }).datum).toBe('Der Termin liegt in der Vergangenheit.')
    expect(terminClientErrors({ ...valid, datum: '2026-10-02' }, { today: TODAY, existingDatum: '2026-10-02' })).toEqual({})
    expect(terminClientErrors({ ...valid, datum: '2027-10-04', serie: 'keine' }, { today: TODAY }).datum).toBe('Termine höchstens ein Jahr im Voraus.')
    expect(terminClientErrors({ ...valid, uhrzeit: '' }, { today: TODAY }).uhrzeit).toBe('Bitte eine Uhrzeit angeben (HH:MM).')
    expect(terminClientErrors({ ...valid, ende: '09:00' }, { today: TODAY }).ende).toBe('Das Ende muss nach dem Beginn liegen.')
    expect(terminClientErrors({ ...valid, serieBis: '2026-10-09' }, { today: TODAY }).serieBis).toBe('Die Serie darf nicht vor dem ersten Termin enden.')
    expect(terminClientErrors({ ...valid, serieBis: '2027-10-11' }, { today: TODAY }).serieBis).toBe('Eine Serie läuft höchstens ein Jahr.')
    expect(terminClientErrors({ ...valid, serie: 'keine', serieBis: '2030-01-01' }, { today: TODAY })).toEqual({})
  })

  test('terminErrorField ordnet Server-Meldungen dem Feld zu', () => {
    expect(terminErrorField('Der Titel darf höchstens 80 Zeichen haben')).toBe('titel')
    expect(terminErrorField('Der Ort darf höchstens 120 Zeichen haben')).toBe('ort')
    expect(terminErrorField('Das Ende muss nach dem Beginn liegen.')).toBe('ende')
    expect(terminErrorField('Eine Serie läuft höchstens ein Jahr.')).toBe('serieBis')
    expect(terminErrorField('Termine höchstens ein Jahr im Voraus.')).toBe('datum')
    expect(terminErrorField('Höchstens 50 Termine – bitte ältere löschen.')).toBe(null)
  })
})

import { describe, expect, test } from 'vitest'
import {
  AMPEL_LABELS,
  ampelSummary,
  formatBytes,
  formatDuration,
  formatLoad,
  formatPercent,
  relativeTime,
  seriesGeometry,
  seriesSummary,
  verlaufSeries
} from './adminServer.js'

const KB = 1024
const MB = 1024 ** 2
const GB = 1024 ** 3

describe('adminServer', () => {
  test('Ampel: Wörter statt nur Farbe', () => {
    expect(AMPEL_LABELS).toEqual({ ok: 'ok', erhoeht: 'erhöht', kritisch: 'kritisch' })
  })

  test('formatBytes: deutsch, passende Einheit', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(4 * KB)).toBe('4 KB')
    expect(formatBytes(3.5 * MB)).toBe('3,5 MB')
    expect(formatBytes(56 * MB)).toBe('56 MB')
    expect(formatBytes(3.7 * GB)).toBe('3,7 GB')
    expect(formatBytes(38 * GB)).toBe('38 GB')
    expect(formatBytes(31.94 * GB)).toBe('31,9 GB')
    expect(formatBytes(312 * GB)).toBe('312 GB')
    expect(formatBytes(2048 * GB)).toBe('2 TB')
    expect(formatBytes(1_048_570)).toBe('1 MB', 'gerundet vor dem Einheitenwechsel, nie "1.024 KB"')
    expect(formatBytes(1023.6 * GB)).toBe('1 TB')
    expect(formatBytes(null)).toBe('–')
    expect(formatBytes(-1)).toBe('–')
  })

  test('Prozent, Last und Dauer', () => {
    expect(formatPercent(16.24)).toBe('16,2 %')
    expect(formatPercent(80)).toBe('80 %')
    expect(formatPercent(null)).toBe('–')
    expect(formatLoad(0.1)).toBe('0,1')
    expect(formatLoad(1.256)).toBe('1,26')
    expect(formatDuration(30)).toBe('unter 1 Minute')
    expect(formatDuration(60)).toBe('1 Minute')
    expect(formatDuration(5 * 60 + 20)).toBe('5 Minuten')
    expect(formatDuration(3 * 3600 + 12 * 60)).toBe('3 Stunden, 12 Minuten')
    expect(formatDuration(3600)).toBe('1 Stunde')
    expect(formatDuration(86400 + 4 * 3600 + 59)).toBe('1 Tag, 4 Stunden')
    expect(formatDuration(12 * 86400)).toBe('12 Tage')
    expect(formatDuration(undefined)).toBe('–')
  })

  test('relativeTime: ruhige Wörter', () => {
    const now = Date.parse('2026-10-03T10:00:00Z')
    expect(relativeTime('2026-10-03T09:59:40Z', now)).toBe('gerade eben')
    expect(relativeTime('2026-10-03T09:55:00Z', now)).toBe('vor 5 Minuten')
    expect(relativeTime('2026-10-03T09:00:00Z', now)).toBe('vor 1 Stunde')
    expect(relativeTime('2026-10-03T03:30:00Z', now)).toBe('vor 6 Stunden')
    expect(relativeTime('2026-10-01T10:00:00Z', now)).toBe('vor 2 Tagen')
    expect(relativeTime('quatsch', now)).toBe('')
  })

  test('ampelSummary: nennt, was erhöht oder kritisch ist', () => {
    expect(ampelSummary({ speicher: { ampel: 'ok' }, platte: { ampel: 'ok' }, last: { ampel: 'ok' } })).toEqual({
      stufe: 'ok',
      text: 'Alles im grünen Bereich.'
    })
    expect(ampelSummary({ speicher: { ampel: 'erhoeht' }, platte: { ampel: 'kritisch' }, last: { ampel: 'ok' } })).toEqual({
      stufe: 'kritisch',
      text: 'Kritisch: Speicherplatz. Erhöht: Arbeitsspeicher.'
    })
    expect(ampelSummary({ speicher: null, platte: { ampel: 'erhoeht' }, last: { ampel: 'erhoeht' } })).toEqual({
      stufe: 'erhoeht',
      text: 'Erhöht: Speicherplatz, Last. Nicht messbar: Arbeitsspeicher.'
    })
    // Eine ausgefallene Messung sieht nie wie „alles grün“ aus.
    expect(ampelSummary({ speicher: { ampel: 'ok' }, platte: null, last: { ampel: 'ok' } })).toEqual({
      stufe: null,
      text: 'Nicht messbar: Speicherplatz.'
    })
    expect(ampelSummary({ speicher: null, platte: null, last: null })).toEqual({ stufe: null, text: 'Keine Messwerte.' })
  })

  test('verlaufSeries: Speicher frei, Platte frei, Last - mit Schwellen als Linie', () => {
    const verlauf = [
      { at: '2026-10-03T08:00:00Z', speicherFrei: 30, platteFrei: 84, last: 0.2 },
      { at: '2026-10-03T09:00:00Z', speicherFrei: null, platteFrei: 83.5, last: 0.4 },
      { at: '2026-10-03T10:00:00Z', speicherFrei: 25, platteFrei: 83, last: 1.6 }
    ]
    const schwellen = { speicher: { gelb: 80, rot: 90 }, platte: { gelb: 70, rot: 85 }, last: { gelb: 0.75, rot: 1 } }
    const series = verlaufSeries(verlauf, schwellen, 2)
    expect(series.map((s) => [s.key, s.label, s.min, s.max, s.schwelle])).toEqual([
      ['speicherFrei', 'Speicher frei', 0, 100, 20],
      ['platteFrei', 'Platte frei', 0, 100, 30],
      ['last', 'Last (1 Minute)', 0, 2, 1.5]
    ])
    expect(series[0].values).toEqual([30, null, 25])
    // Die Last-Skala wächst mit dem Höchstwert, nie unter die Kernzahl.
    expect(verlaufSeries([{ at: 'x', speicherFrei: 1, platteFrei: 1, last: 3.1 }], schwellen, 2)[2].max).toBe(3.1)
  })

  test('seriesGeometry: Lücken bei fehlenden Werten, feste Skala, letzter Punkt', () => {
    const size = { width: 100, height: 50, pad: 5 }
    const geometry = seriesGeometry([0, 50, null, 100], { min: 0, max: 100 }, size)
    expect(geometry.line).toBe('M5,45 L35,25 M95,5')
    expect(geometry.last).toEqual({ x: 95, y: 5 })
    expect(geometry.yOf(50)).toBe(25)
    expect(seriesGeometry([], { min: 0, max: 100 }, size)).toEqual(expect.objectContaining({ line: '', last: null }))
    expect(seriesGeometry([42], { min: 0, max: 100 }, size).last).toEqual({ x: 50, y: 28.2 })
  })

  test('seriesSummary: Textalternative mit Tiefst-, Höchst- und letztem Wert', () => {
    expect(seriesSummary('Speicher frei', [30, null, 25, 40], formatPercent)).toBe(
      'Speicher frei: zuletzt 40 %, niedrigster Wert 25 %, höchster Wert 40 % (3 Messungen).'
    )
    expect(seriesSummary('Last', [0.5], formatLoad)).toBe('Last: zuletzt 0,5 (1 Messung).')
    expect(seriesSummary('Last', [null], formatLoad)).toBe('Last: noch keine Messungen.')
  })
})

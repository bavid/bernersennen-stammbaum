import { describe, expect, test } from 'vitest'
import {
  SPARKLINE,
  barPercent,
  eingeloesteGesamt,
  formatNumber,
  formatTagKurz,
  klicksLetzteTage,
  mundpropagandaText,
  plural,
  sparklineGeometry,
  sparklinePath,
  sparklinePoints,
  sparklineSummary,
  stackedSegments,
  sum,
  topPartner
} from './adminStats.js'

// 30 Tage bis zum 29.09.2026, Klicks nur an ausgewählten Tagen.
function tage(values) {
  const start = Date.UTC(2026, 7, 31)
  return values.map((anzahl, index) => ({ tag: new Date(start + index * 86_400_000).toISOString().slice(0, 10), anzahl }))
}

describe('adminStats – Summen und Zahlen', () => {
  test('formatNumber schreibt de-DE mit Punkt als Tausendertrenner, Unsinn wird 0', () => {
    expect(formatNumber(1234)).toBe('1.234')
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(undefined)).toBe('0')
    expect(formatNumber('7')).toBe('7')
  })

  test('plural wählt Einzahl nur bei genau 1', () => {
    expect(plural(1, 'Kette', 'Ketten')).toBe('1 Kette')
    expect(plural(0, 'Kette', 'Ketten')).toBe('0 Ketten')
    expect(plural(1500, 'Klick', 'Klicks')).toBe('1.500 Klicks')
  })

  test('sum ignoriert fehlende Zeilen und fehlende Werte', () => {
    expect(sum([{ a: 2 }, { a: 3 }, {}, null], 'a')).toBe(5)
    expect(sum(undefined, 'a')).toBe(0)
  })

  test('eingeloesteGesamt summiert über alle Zwecke', () => {
    const zweck = [
      { zweck: 'chronik', gesamt: 40, eingeloest: 1234, offen: 20, widerrufen: 3 },
      { zweck: 'partnerzugang', gesamt: 5, eingeloest: 2, offen: 3, widerrufen: 0 }
    ]
    expect(eingeloesteGesamt(zweck)).toBe(1236)
    expect(eingeloesteGesamt([])).toBe(0)
  })

  test('klicksLetzteTage nimmt die letzten 7 Einträge der Reihe', () => {
    const reihe = tage([...Array(23).fill(0), 1, 2, 3, 4, 5, 6, 7])
    reihe[10] = { ...reihe[10], anzahl: 99 }
    expect(klicksLetzteTage(reihe)).toBe(28)
    expect(klicksLetzteTage(reihe, 2)).toBe(13)
    expect(klicksLetzteTage([{ tag: '2026-09-29', anzahl: 4 }])).toBe(4)
    expect(klicksLetzteTage(undefined)).toBe(0)
  })
})

describe('adminStats – Balken', () => {
  test('stackedSegments rechnet Anteile in Prozent und lässt leere Segmente weg', () => {
    expect(stackedSegments({ eingeloest: 6, offen: 3, widerrufen: 1 })).toEqual([
      { key: 'eingeloest', label: 'Eingelöst', value: 6, percent: 60 },
      { key: 'offen', label: 'Offen', value: 3, percent: 30 },
      { key: 'widerrufen', label: 'Zurückgezogen', value: 1, percent: 10 }
    ])
    expect(stackedSegments({ eingeloest: 1, offen: 2, widerrufen: 0 }).map((s) => [s.key, s.percent])).toEqual([
      ['eingeloest', 33.3],
      ['offen', 66.7]
    ])
  })

  test('stackedSegments ohne Gutscheine: keine Segmente', () => {
    expect(stackedSegments({ eingeloest: 0, offen: 0, widerrufen: 0 })).toEqual([])
    expect(stackedSegments(undefined)).toEqual([])
  })

  test('barPercent relativ zum Höchstwert, nie über 100', () => {
    expect(barPercent(5, 5)).toBe(100)
    expect(barPercent(2, 5)).toBe(40)
    expect(barPercent(1, 3)).toBe(33.3)
    expect(barPercent(7, 5)).toBe(100)
    expect(barPercent(0, 5)).toBe(0)
    expect(barPercent(3, 0)).toBe(0)
  })

  test('topPartner: nur Partner mit neuen Bereichen, absteigend, höchstens 5', () => {
    const partner = [
      { partnerId: 1, name: 'Hundesalon Fellglanz', neueBereiche: 0 },
      { partnerId: 2, name: 'Tierheim Wiesengrund', neueBereiche: 2 },
      { partnerId: 3, name: 'Hundeschule Pfotenglück', neueBereiche: 5 },
      { partnerId: 4, name: 'Betreuung Waldrand', neueBereiche: 2 },
      { partnerId: 5, name: 'Futterhof Deichland', neueBereiche: 1 },
      { partnerId: 6, name: 'Hundeschule Uferweg', neueBereiche: 1 },
      { partnerId: 7, name: 'Pension Bergblick', neueBereiche: 1 }
    ]
    expect(topPartner(partner).map((p) => p.partnerId)).toEqual([3, 4, 2, 5, 6])
    expect(topPartner(partner, 2).map((p) => p.partnerId)).toEqual([3, 4])
    expect(topPartner([{ partnerId: 1, name: 'A', neueBereiche: 0 }])).toEqual([])
    expect(topPartner(undefined)).toEqual([])
  })
})

describe('adminStats – Mundpropaganda', () => {
  test('Überschrift mit Ketten und Tiefe, Einzahl bei 1', () => {
    expect(mundpropagandaText({ ketten: 3, maxTiefe: 2 })).toBe('3 Ketten, tiefste 2 Stufen')
    expect(mundpropagandaText({ ketten: 1, maxTiefe: 1 })).toBe('1 Kette, tiefste 1 Stufe')
    expect(mundpropagandaText({ ketten: 0, maxTiefe: 0 })).toBe('Noch keine Weitergaben')
    expect(mundpropagandaText(undefined)).toBe('Noch keine Weitergaben')
  })
})

describe('adminStats – Sparkline', () => {
  test('formatTagKurz macht aus ISO-Tagen "TT.MM."', () => {
    expect(formatTagKurz('2026-09-29')).toBe('29.09.')
    expect(formatTagKurz('2026-09-29 10:00:00')).toBe('29.09.')
    expect(formatTagKurz('heute')).toBe('')
    expect(formatTagKurz(undefined)).toBe('')
  })

  test('sparklinePoints verteilt x gleichmäßig und skaliert y am Höchstwert', () => {
    const size = { width: 100, height: 40, pad: 5 }
    const points = sparklinePoints(tage([0, 5, 10]).slice(0, 3), size)
    expect(points).toEqual([
      { x: 5, y: 35 },
      { x: 50, y: 20 },
      { x: 95, y: 5 }
    ])
  })

  test('sparklinePoints ohne Klicks liegt auf der Grundlinie, ein Tag sitzt mittig', () => {
    const size = { width: 100, height: 40, pad: 5 }
    expect(sparklinePoints(tage([0, 0]).slice(0, 2), size).map((p) => p.y)).toEqual([35, 35])
    expect(sparklinePoints([{ tag: '2026-09-29', anzahl: 3 }], size)).toEqual([{ x: 50, y: 5 }])
    expect(sparklinePoints([], size)).toEqual([])
  })

  test('sparklinePath und sparklineGeometry: M/L-Pfad, Fläche bis zur Grundlinie, Endpunkt', () => {
    const size = { width: 100, height: 40, pad: 5 }
    const geometry = sparklineGeometry(tage([0, 5, 10]).slice(0, 3), size)
    expect(geometry.line).toBe('M5,35 L50,20 L95,5')
    expect(sparklinePath(geometry.points)).toBe(geometry.line)
    expect(geometry.area).toBe('M5,35 L50,20 L95,5 L95,35 L5,35 Z')
    expect(geometry.baselineY).toBe(35)
    expect(geometry.last).toEqual({ x: 95, y: 5 })
  })

  test('sparklineGeometry ohne Daten: leere Pfade, kein Endpunkt', () => {
    expect(sparklineGeometry([])).toEqual({ points: [], line: '', area: '', baselineY: SPARKLINE.height - SPARKLINE.pad, last: null })
  })

  test('sparklineSummary nennt Gesamt, 7 Tage und den Höchstwert mit Datum', () => {
    const reihe = tage([...Array(23).fill(0), 1, 2, 3, 4, 5, 6, 7])
    reihe[10] = { ...reihe[10], anzahl: 1200 }
    expect(sparklineSummary(reihe)).toBe(
      'Klicks der letzten 30 Tage: 1.228 insgesamt, 28 in den letzten 7 Tagen, Höchstwert 1.200 am 10.09.'
    )
  })

  test('sparklineSummary ohne Klicks bzw. ohne Daten', () => {
    expect(sparklineSummary(tage(Array(30).fill(0)))).toBe('Klicks der letzten 30 Tage: 0 insgesamt, 0 in den letzten 7 Tagen.')
    expect(sparklineSummary([])).toBe('Klicks: noch keine Daten')
  })
})

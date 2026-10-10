import { describe, expect, test } from 'vitest'
import { MAX_DAYS, MAX_PER_ENTRY, MAX_PHOTOS, groupByDay, initialSelection, planImport } from './group.js'

const photo = (id, date) => ({ id, date })

describe('groupByDay', () => {
  test('gruppiert je Tag, aufsteigend, Reihenfolge innerhalb bleibt', () => {
    const days = groupByDay([photo('a', '2024-05-02'), photo('b', '2024-05-01'), photo('c', '2024-05-02'), photo('d', null)])
    expect(days.map((d) => d.date)).toEqual(['2024-05-01', '2024-05-02'])
    expect(days[1].items.map((i) => i.id)).toEqual(['a', 'c'])
  })
})

describe('planImport', () => {
  test('nur ausgewählte Fotos, abgewählte Tage fallen weg', () => {
    const days = groupByDay([photo('a', '2024-01-01'), photo('b', '2024-01-02'), photo('c', '2024-01-02')])
    const result = planImport(days, new Set(['b']))
    expect(result.plan).toEqual([{ date: '2024-01-02', items: [days[1].items[0]] }])
    expect(result.photos).toBe(1)
    expect(result.skipped).toBe(0)
  })

  test('höchstens 20 Fotos je Erinnerung', () => {
    const items = Array.from({ length: 25 }, (_, i) => photo(`p${i}`, '2024-03-03'))
    const result = planImport(groupByDay(items), items.map((i) => i.id))
    expect(result.plan[0].items).toHaveLength(MAX_PER_ENTRY)
    expect(result.skipped).toBe(5)
  })

  test('höchstens 60 Fotos und 20 Erinnerungen je Durchgang', () => {
    const many = Array.from({ length: 30 }, (_, d) => [0, 1, 2].map((k) => photo(`d${d}-${k}`, `2024-01-${String(d + 1).padStart(2, '0')}`))).flat()
    const days = groupByDay(many)
    const result = planImport(days, many.map((p) => p.id))
    expect(result.photos).toBe(MAX_PHOTOS)
    expect(result.plan).toHaveLength(MAX_DAYS)
    expect(result.skipped).toBe(90 - 60)
    expect(initialSelection(days).size).toBe(MAX_PHOTOS)
  })
})

import { describe, expect, test } from 'vitest'
import { areaOptions, areaParam, filterByArea, filterPages, selectedAreaParam } from './startFilter.js'

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'eigen' }
const family = { id: 5, name: 'Familie Sonnenhang', art: 'familie' }
const visit = { id: 8, name: 'Zuhause Möwenweg', art: 'besuch' }
const entry = (id, area) => ({ type: 'eintrag', id, area })
const zettel = (id, area) => ({ type: 'zettel', id, area })

describe('areaParam', () => {
  test('das eigene Zuhause ist „eigen“, andere Bereiche ihre Id', () => {
    expect(areaParam(home)).toBe('eigen')
    expect(areaParam(family)).toBe('5')
    expect(areaParam(undefined)).toBe('eigen')
  })
})

describe('areaOptions', () => {
  test('„Alle“ und je Zuhause ein Chip mit Zahl - das eigene zuerst, die übrigen nach Namen; Zettel zählen nicht', () => {
    const items = [entry(1, visit), entry(2, home), entry(3, family), entry(4, home), zettel(9, family)]
    expect(areaOptions(items)).toEqual([
      { param: null, label: 'Alle', count: 4 },
      { param: 'eigen', label: 'Mein Zuhause', count: 2 },
      { param: '5', label: 'Familie Sonnenhang', count: 1 },
      { param: '8', label: 'Zuhause Möwenweg', count: 1 }
    ])
  })

  test('nur ein Zuhause oder nichts geladen: keine Chips', () => {
    expect(areaOptions([entry(1, home), entry(2, home)])).toEqual([])
    expect(areaOptions([])).toEqual([])
    expect(areaOptions(null)).toEqual([])
  })

  test('der Name des eigenen Zuhauses lässt sich vorgeben (klassischer Familien-Login)', () => {
    expect(areaOptions([entry(1, home), entry(2, family)], { ownLabel: 'Rudel vom Heidekamp' })[1].label).toBe('Rudel vom Heidekamp')
  })
})

describe('selectedAreaParam und Filtern', () => {
  const options = areaOptions([entry(1, home), entry(2, family)])

  test('nur eine Gruppe aus den Chips zählt, sonst „Alle“', () => {
    expect(selectedAreaParam('5', options)).toBe('5')
    expect(selectedAreaParam('999', options)).toBe(null)
    expect(selectedAreaParam(null, options)).toBe(null)
  })

  test('filterByArea und filterPages lassen bei „Alle“ alles durch', () => {
    const pages = [[entry(1, home), entry(2, family)], [entry(3, visit)]]
    expect(filterByArea(pages[0], '5').map((item) => item.id)).toEqual([2])
    expect(filterByArea(pages[0], null)).toBe(pages[0])
    expect(filterPages(pages, '8').map((page) => page.map((item) => item.id))).toEqual([[], [3]])
    expect(filterPages(pages, null)).toBe(pages)
    expect(filterPages(null, '8')).toBe(null)
  })
})

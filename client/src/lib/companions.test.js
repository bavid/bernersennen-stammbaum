import { describe, expect, test } from 'vitest'
import {
  HERKUNFT_LABELS,
  companionLine,
  companionRows,
  herkunftText,
  nextAnniversary,
  position,
  yearSpan,
  yearsTogether
} from './companions.js'

const dog = (id, name, extra = {}) => ({
  id,
  name,
  bei_uns_seit: null,
  bei_uns_bis: null,
  abschied_grund: null,
  herkunft_art: null,
  herkunft_text: null,
  geburtsdatum: null,
  ...extra
})

describe('companionRows', () => {
  test('sorts by start date, then by name, and falls back to the birth date without a move-in date', () => {
    const dogs = [
      dog(1, 'Wilma', { bei_uns_seit: '2020-01-01' }),
      dog(2, 'Aiko', { geburtsdatum: '2018-05-12' }),
      dog(3, 'Bello', { bei_uns_seit: '2018-05-12' })
    ]
    const rows = companionRows(dogs, '2026-09-28')
    expect(rows.map((r) => r.dog.name)).toEqual(['Aiko', 'Bello', 'Wilma'])
    expect(rows[0].start).toBe('2018-05-12')
  })

  test('drops animals without a move-in or birth date', () => {
    const dogs = [dog(1, 'Ohne Datum'), dog(2, 'Mit Datum', { geburtsdatum: '2020-01-01' })]
    const rows = companionRows(dogs, '2026-09-28')
    expect(rows.map((r) => r.dog.name)).toEqual(['Mit Datum'])
  })

  test('marks animals without a farewell date as ongoing, ending at today', () => {
    const rows = companionRows([dog(1, 'Nele', { bei_uns_seit: '2020-01-01' })], '2026-09-28')
    expect(rows[0]).toMatchObject({ start: '2020-01-01', end: '2026-09-28', ongoing: true, departed: false })
  })

  test('marks animals with a farewell date as departed, ending there', () => {
    const rows = companionRows([dog(1, 'Aiko', { bei_uns_seit: '2010-01-01', bei_uns_bis: '2018-06-01' })], '2026-09-28')
    expect(rows[0]).toMatchObject({ start: '2010-01-01', end: '2018-06-01', ongoing: false, departed: true })
  })
})

describe('yearSpan', () => {
  test('spans from the earliest start to the latest end, including today', () => {
    const rows = companionRows(
      [dog(1, 'Aiko', { bei_uns_seit: '2010-03-01' }), dog(2, 'Bello', { bei_uns_seit: '2015-01-01', bei_uns_bis: '2018-06-01' })],
      '2026-09-28'
    )
    expect(yearSpan(rows, '2026-09-28')).toEqual({ from: 2010, to: 2026 })
  })

  test('is null without rows', () => {
    expect(yearSpan([], '2026-09-28')).toBeNull()
  })
})

describe('position', () => {
  const span = { from: 2010, to: 2020 }

  test('is 0 on January 1st of the first year', () => {
    expect(position('2010-01-01', span)).toBe(0)
  })

  test('is close to 1 on December 31st of the last year', () => {
    expect(position('2020-12-31', span)).toBeCloseTo(1, 1)
  })

  test('is in the middle for a date halfway through the span', () => {
    expect(position('2015-07-02', span)).toBeCloseTo(0.5, 1)
  })
})

describe('nextAnniversary', () => {
  test('finds the soonest anniversary among the animals still living with us', () => {
    const dogs = [
      dog(1, 'Nele', { bei_uns_seit: '2021-10-05' }),
      dog(2, 'Bello', { bei_uns_seit: '2019-01-01' })
    ]
    const result = nextAnniversary(dogs, '2026-09-28')
    expect(result.dog.name).toBe('Nele')
    expect(result.date).toBe('2026-10-05')
    expect(result.years).toBe(5)
    expect(result.daysUntil).toBe(7)
  })

  test('today counts as the anniversary itself (daysUntil 0)', () => {
    const result = nextAnniversary([dog(1, 'Nele', { bei_uns_seit: '2021-09-28' })], '2026-09-28')
    expect(result).toEqual({ dog: expect.objectContaining({ name: 'Nele' }), date: '2026-09-28', years: 5, daysUntil: 0 })
  })

  test('years is always at least 1 – a move-in today is not its own anniversary', () => {
    const result = nextAnniversary([dog(1, 'Frischling', { bei_uns_seit: '2026-09-28' })], '2026-09-28')
    expect(result.years).toBe(1)
    expect(result.date).toBe('2027-09-28')
  })

  test('excludes animals that have already left', () => {
    const dogs = [dog(1, 'Aiko', { bei_uns_seit: '2020-01-01', bei_uns_bis: '2022-01-01' })]
    expect(nextAnniversary(dogs, '2026-09-28')).toBeNull()
  })

  test('excludes animals without a move-in date', () => {
    expect(nextAnniversary([dog(1, 'Nele', { geburtsdatum: '2020-01-01' })], '2026-09-28')).toBeNull()
  })

  test('is null without any eligible animal', () => {
    expect(nextAnniversary([], '2026-09-28')).toBeNull()
  })
})

describe('yearsTogether', () => {
  test('sums the whole years of every row, rounded down', () => {
    const rows = companionRows(
      [
        dog(1, 'Aiko', { bei_uns_seit: '2016-09-28' }), // genau 10 Jahre bis heute
        dog(2, 'Bello', { bei_uns_seit: '2010-01-01', bei_uns_bis: '2011-07-01' }) // knapp 1,5 Jahre -> 1
      ],
      '2026-09-28'
    )
    expect(yearsTogether(rows)).toBe(11)
  })

  test('is 0 without rows', () => {
    expect(yearsTogether([])).toBe(0)
  })
})

describe('herkunftText', () => {
  test('combines the label and free text', () => {
    expect(herkunftText(dog(1, 'Nele', { herkunft_art: 'tierheim', herkunft_text: 'Tierheim Sonnenhang' }))).toBe(
      'aus dem Tierheim – Tierheim Sonnenhang'
    )
    expect(herkunftText(dog(1, 'Nele', { herkunft_art: 'privat', herkunft_text: 'Bauernhof-Wurf' }))).toBe('von privat – Bauernhof-Wurf')
  })

  test('shows only the label without free text', () => {
    expect(herkunftText(dog(1, 'Nele', { herkunft_art: 'zuechter' }))).toBe('vom Züchter')
    expect(herkunftText(dog(1, 'Nele', { herkunft_art: 'nachwuchs' }))).toBe('eigener Nachwuchs')
    expect(herkunftText(dog(1, 'Nele', { herkunft_art: 'fundtier' }))).toBe('als Fundtier')
  })

  test('"anderes" shows only the free text', () => {
    expect(herkunftText(dog(1, 'Nele', { herkunft_art: 'anderes', herkunft_text: 'Von der Straße geholt' }))).toBe(
      'Von der Straße geholt'
    )
    expect(herkunftText(dog(1, 'Nele', { herkunft_art: 'anderes' }))).toBe('')
  })

  test('is empty without any information', () => {
    expect(herkunftText(dog(1, 'Nele'))).toBe('')
  })

  test('HERKUNFT_LABELS covers every herkunft_art', () => {
    expect(Object.keys(HERKUNFT_LABELS)).toEqual(['tierheim', 'privat', 'zuechter', 'nachwuchs', 'fundtier', 'anderes'])
  })
})

describe('companionLine', () => {
  test('ongoing: move-in date and herkunft combine with a middot', () => {
    expect(
      companionLine(dog(1, 'Nele', { bei_uns_seit: '2021-06-12', herkunft_art: 'tierheim', herkunft_text: 'Tierheim Sonnenhang' }))
    ).toEqual({ text: 'Bei euch seit 12. Juni 2021 · aus dem Tierheim – Tierheim Sonnenhang', memorial: false })
  })

  test('ongoing: only the move-in date, no herkunft', () => {
    expect(companionLine(dog(1, 'Nele', { bei_uns_seit: '2021-06-12' }))).toEqual({
      text: 'Bei euch seit 12. Juni 2021',
      memorial: false
    })
  })

  test('ongoing: only herkunft, no move-in date', () => {
    expect(companionLine(dog(1, 'Nele', { herkunft_art: 'zuechter' }))).toEqual({ text: 'vom Züchter', memorial: false })
  })

  test('ongoing: nothing known -> null', () => {
    expect(companionLine(dog(1, 'Nele'))).toBeNull()
  })

  test('departed, verstorben: "In Erinnerung" with the year span', () => {
    expect(companionLine(dog(1, 'Aiko', { bei_uns_seit: '2010-01-01', bei_uns_bis: '2022-06-01', abschied_grund: 'verstorben' }))).toEqual(
      { text: 'In Erinnerung · 2010–2022', memorial: true }
    )
  })

  test('departed, verstorben: falls back to the birth year without a move-in date', () => {
    expect(companionLine(dog(1, 'Aiko', { geburtsdatum: '2010-01-01', bei_uns_bis: '2022-06-01', abschied_grund: 'verstorben' }))).toEqual(
      { text: 'In Erinnerung · 2010–2022', memorial: true }
    )
  })

  test('departed, other reason: year span plus the reason label', () => {
    expect(companionLine(dog(1, 'Bello', { bei_uns_seit: '2018-01-01', bei_uns_bis: '2020-01-01', abschied_grund: 'abgegeben' }))).toEqual(
      { text: 'Bei euch 2018–2020 · abgegeben', memorial: false }
    )
    expect(companionLine(dog(1, 'Bello', { bei_uns_seit: '2018-01-01', bei_uns_bis: '2020-01-01', abschied_grund: 'umgezogen' }))).toEqual(
      { text: 'Bei euch 2018–2020 · umgezogen', memorial: false }
    )
    expect(companionLine(dog(1, 'Bello', { bei_uns_seit: '2018-01-01', bei_uns_bis: '2020-01-01', abschied_grund: 'anderes' }))).toEqual(
      { text: 'Bei euch 2018–2020 · aus anderem Grund', memorial: false }
    )
  })

  test('shared animal, ongoing: "Bei euch" becomes "Im {ownerName}"', () => {
    expect(
      companionLine(dog(1, 'Nele', { bei_uns_seit: '2021-06-12', herkunft_art: 'tierheim', herkunft_text: 'Tierheim Sonnenhang' }), {
        ownerName: 'Zuhause am Deich'
      })
    ).toEqual({ text: 'Im Zuhause am Deich seit 12. Juni 2021 · aus dem Tierheim – Tierheim Sonnenhang', memorial: false })
  })

  test('shared animal, departed for another reason: "Bei euch" becomes "Im {ownerName}" too', () => {
    expect(
      companionLine(dog(1, 'Bello', { bei_uns_seit: '2018-01-01', bei_uns_bis: '2020-01-01', abschied_grund: 'umgezogen' }), {
        ownerName: 'Zuhause am Deich'
      })
    ).toEqual({ text: 'Im Zuhause am Deich 2018–2020 · umgezogen', memorial: false })
  })

  test('shared animal, deceased: the memorial wording stays as-is, no owner name', () => {
    expect(
      companionLine(dog(1, 'Aiko', { bei_uns_seit: '2010-01-01', bei_uns_bis: '2022-06-01', abschied_grund: 'verstorben' }), {
        ownerName: 'Zuhause am Deich'
      })
    ).toEqual({ text: 'In Erinnerung · 2010–2022', memorial: true })
  })
})

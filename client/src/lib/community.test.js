import { describe, expect, test } from 'vitest'
import { tickerDuration, tickerItems, tickerSentence } from './community.js'

const FULL = {
  familien: 10,
  zuhause: 12,
  erinnerungen: 1234,
  fotos: 0,
  partner: 1,
  spendenCents: 50099,
  partnerVorgestellt: [{ slug: 'hundeschule-pfotenglueck', name: 'Hundeschule Pfotenglück', typ: 'hundeschule' }]
}

describe('Laufband: Einträge', () => {
  test('Zahlen deutsch formatiert, Euro ganz, Nullen fallen weg, ein vorgestellter Partner = „Partner des Monats“ mit Link', () => {
    const items = tickerItems(FULL)
    expect(items.map((item) => item.text)).toEqual([
      'Dabei sind 10 Familien',
      '12 Zuhause',
      '1.234 Erinnerungen',
      expect.stringMatching(/^500\s€ Spenden$/),
      '1 Partner',
      'Partner des Monats: Hundeschule Pfotenglück'
    ])
    expect(items.at(-1).href).toBe('/p/hundeschule-pfotenglueck')
    expect(items.filter((item) => item.href)).toHaveLength(1)
  })

  test('Singular und mehrere Vorgestellte', () => {
    const items = tickerItems({ familien: 1, zuhause: 1, erinnerungen: 1, fotos: 1, partnerVorgestellt: [{ slug: 'a-b-c', name: 'A' }, { slug: 'd-e-f', name: 'D' }] })
    expect(items.map((item) => item.text)).toEqual(['Dabei ist 1 Familie', '1 Zuhause', '1 Erinnerung', '1 Foto', 'Vorgestellt: A', 'Vorgestellt: D'])
  })

  test('alles 0 oder keine Daten -> leer; Satz und Dauer', () => {
    expect(tickerItems({ familien: 0, zuhause: 0, erinnerungen: 0, fotos: 0, partner: 0, spendenCents: 0, partnerVorgestellt: [] })).toEqual([])
    expect(tickerItems(null)).toEqual([])
    expect(tickerSentence([])).toBe('')
    expect(tickerSentence(tickerItems({ familien: 2, erinnerungen: 5 }))).toBe('Dabei sind 2 Familien, 5 Erinnerungen.')
    expect(tickerDuration([{ text: 'x' }])).toBe(40)
    expect(tickerDuration(Array.from({ length: 40 }, () => ({ text: 'Dabei sind 10 Familien' })))).toBe(80)
  })
})

describe('Laufband: Zahl und Wort, Englisch', () => {
  test('Einträge tragen Zahl, Wort und Symbol; vorgestellte Partner sind hervorgehoben', async () => {
    const items = tickerItems(FULL)
    expect(items[2]).toMatchObject({ key: 'erinnerungen', value: '1.234', label: 'Erinnerungen', icon: 'book' })
    expect(items.at(-1)).toMatchObject({ featured: true, kicker: 'Partner des Monats', label: 'Hundeschule Pfotenglück' })
  })

  test('auf Englisch: englische Wörter und Zahlen', async () => {
    const { setLang } = await import('./i18n/index.js')
    setLang('en')
    try {
      const items = tickerItems(FULL)
      expect(items.map((item) => item.text)).toEqual([
        'On board: 10 families',
        '12 homes',
        '1,234 memories',
        expect.stringMatching(/^€500 donated$/),
        '1 partner',
        'Partner of the month: Hundeschule Pfotenglück'
      ])
    } finally {
      setLang('de')
    }
  })
})

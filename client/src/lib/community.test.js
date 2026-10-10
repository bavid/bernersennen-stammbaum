import { describe, expect, test } from 'vitest'
import { tickerDuration, tickerHero, tickerItems, tickerSentence } from './community.js'

const FULL = {
  familien: 10,
  zuhause: 12,
  erinnerungen: 1234,
  fotos: 0,
  partner: 1,
  spendenCents: 50099,
  partnerVorgestellt: [{ slug: 'hundeschule-pfotenglueck', name: 'Hundeschule Pfotenglück', typ: 'hundeschule', fotos: ['/public-media/a.jpg', 'https://evil/x.jpg'] }]
}

describe('Laufband: Einträge', () => {
  test('Zahlen deutsch formatiert, Euro ganz, Nullen fallen weg; ein vorgestellter Partner = „Partner des Monats“ vorn (tickerHero)', () => {
    const items = tickerItems(FULL)
    expect(items.map((item) => item.text)).toEqual([
      'Dabei sind 10 Familien',
      '12 Zuhause',
      '1.234 Erinnerungen',
      expect.stringMatching(/^500\s€ Spenden$/),
      '1 Partner'
    ])
    expect(items.filter((item) => item.href)).toHaveLength(0)
    expect(tickerHero(FULL)).toEqual({
      slug: 'hundeschule-pfotenglueck',
      name: 'Hundeschule Pfotenglück',
      href: '/p/hundeschule-pfotenglueck',
      kicker: 'Partner des Monats',
      fotos: ['/public-media/a.jpg']
    })
    expect(tickerHero({ ...FULL, partnerVorgestellt: [] })).toBeNull()
  })

  test('Singular und mehrere Vorgestellte: der erste vorn, die übrigen als Karten', () => {
    const data = { familien: 1, zuhause: 1, erinnerungen: 1, fotos: 1, partnerVorgestellt: [{ slug: 'a-b-c', name: 'A' }, { slug: 'd-e-f', name: 'D' }] }
    expect(tickerItems(data).map((item) => item.text)).toEqual(['Dabei ist 1 Familie', '1 Zuhause', '1 Erinnerung', '1 Foto', 'Vorgestellt: D'])
    expect(tickerHero(data)).toMatchObject({ name: 'A', kicker: 'Vorgestellt', fotos: [] })
    expect(tickerHero({ ...data, banner: { partnerDesMonats: true } }).kicker).toBe('Partner des Monats')
  })

  test('Admin-Einstellung: nur gewählte Zahlen, eigener Eintrag mit internem Link (fremde Links fallen weg)', () => {
    const data = { ...FULL, banner: { chips: ['erinnerungen', 'partner'], hinweis: { text: 'Neu: Wir waren hier', link: '/partner-werden' } } }
    const items = tickerItems(data)
    expect(items.map((item) => item.text)).toEqual(['1.234 Erinnerungen', '1 Partner', 'Neu: Wir waren hier'])
    expect(items.at(-1)).toMatchObject({ hinweis: true, href: '/partner-werden' })
    for (const link of ['//x', 'https://evil', '/\\evil']) {
      expect(tickerItems({ banner: { chips: [], hinweis: { text: 'T', link } } })[0].href).toBeUndefined()
    }
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
  test('Einträge tragen Zahl, Wort und Symbol; der vorgestellte Partner steht vorn', async () => {
    const items = tickerItems(FULL)
    expect(items[2]).toMatchObject({ key: 'erinnerungen', value: '1.234', label: 'Erinnerungen', icon: 'book' })
    expect(tickerHero(FULL)).toMatchObject({ kicker: 'Partner des Monats', name: 'Hundeschule Pfotenglück' })
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
        '1 partner'
      ])
      expect(tickerHero(FULL).kicker).toBe('Partner of the month')
    } finally {
      setLang('de')
    }
  })
})

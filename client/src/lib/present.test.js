import { describe, expect, test } from 'vitest'
import { portalTabs } from './portalTabs.js'
import {
  DEMO_START_PATH,
  PRESENT_PORTAL_TILES,
  PRESENT_TILES,
  demoStartUrl,
  parseDemoStart,
  portalPreviewUrl,
  portalTileUrl
} from './present.js'

describe('present – Kacheln und /demo-start-Adressen', () => {
  test('sechs Kacheln: Familie, Rudel, Tierheim, Hundeschule, Hundesalon, Kundensicht', () => {
    expect(PRESENT_TILES.map((tile) => tile.label)).toEqual([
      'Als Familie ansehen',
      'Als Rudel ansehen',
      'Als Tierheim ansehen',
      'Als Hundeschule ansehen',
      'Als Hundesalon ansehen',
      'Kundensicht eines Partners'
    ])
  })

  test('demoStartUrl trägt as, slug und ziel nur, wo sie gebraucht werden', () => {
    expect(demoStartUrl({ as: 'zuhause' })).toBe(`${DEMO_START_PATH}?as=zuhause`)
    expect(demoStartUrl({ as: 'rudel' })).toBe(`${DEMO_START_PATH}?as=rudel`)
    expect(demoStartUrl({ as: 'partner', slug: 'hundesalon-wuschelglueck' })).toBe(`${DEMO_START_PATH}?as=partner&slug=hundesalon-wuschelglueck`)
    expect(demoStartUrl({ as: 'partner', slug: 'hundeschule-pfotenglueck', ziel: 'kundensicht' })).toBe(
      `${DEMO_START_PATH}?as=partner&slug=hundeschule-pfotenglueck&ziel=kundensicht`
    )
  })

  test('jede Kachel ergibt eine Adresse, die parseDemoStart wieder versteht', () => {
    for (const tile of PRESENT_TILES) {
      const parsed = parseDemoStart(demoStartUrl(tile).slice(DEMO_START_PATH.length))
      expect(parsed, tile.key).not.toBeNull()
      expect(parsed.as).toBe(tile.as)
      expect(parsed.slug).toBe(tile.slug ?? null)
    }
  })
})

describe('present – parseDemoStart', () => {
  test('ohne as oder mit as=zuhause: keine Argumente für api.demo (Demo-Zuhause)', () => {
    expect(parseDemoStart('')).toEqual({ as: 'zuhause', slug: null, demoArgs: {}, route: null })
    expect(parseDemoStart('?as=zuhause').demoArgs).toEqual({})
  })

  test('rudel, tierheim und partner gehen als "as" an den Server, partner mit slug', () => {
    expect(parseDemoStart('?as=rudel').demoArgs).toEqual({ as: 'rudel' })
    expect(parseDemoStart('?as=tierheim').demoArgs).toEqual({ as: 'tierheim' })
    expect(parseDemoStart('?as=partner').demoArgs).toEqual({ as: 'partner' })
    expect(parseDemoStart('?as=partner&slug=hundesalon-wuschelglueck').demoArgs).toEqual({ as: 'partner', slug: 'hundesalon-wuschelglueck' })
  })

  test('ziel=kundensicht führt nach /kundensicht, sonst bleibt die Startroute (null)', () => {
    expect(parseDemoStart('?as=partner&slug=hundeschule-pfotenglueck&ziel=kundensicht').route).toBe('/kundensicht')
    expect(parseDemoStart('?as=partner').route).toBeNull()
  })

  test('unbekanntes as, slug ohne partner, ungültiger slug oder unbekanntes ziel: null', () => {
    expect(parseDemoStart('?as=admin')).toBeNull()
    expect(parseDemoStart('?as=tierheim&slug=hundeschule-pfotenglueck')).toBeNull()
    expect(parseDemoStart('?as=partner&slug=Böse%20Eingabe')).toBeNull()
    expect(parseDemoStart('?as=partner&slug=ab')).toBeNull()
    expect(parseDemoStart('?as=partner&ziel=admin')).toBeNull()
  })
})

describe('present – portalPreviewUrl', () => {
  test('echte Partner: /p/<slug>; Demo-Partner mit ?demo=1; ohne Partner null', () => {
    expect(portalPreviewUrl({ slug: 'hundeschule-wiesengrund', is_demo: 0 })).toBe('/p/hundeschule-wiesengrund')
    expect(portalPreviewUrl({ slug: 'hundeschule-pfotenglueck', is_demo: 1 })).toBe('/p/hundeschule-pfotenglueck?demo=1')
    expect(portalPreviewUrl(null)).toBeNull()
    expect(portalPreviewUrl({})).toBeNull()
  })
})

describe('present – Kacheln für die öffentlichen Portale', () => {
  test('drei Portale der Demo-Partner (seed/demo-partners.js): Tierheim, Hundeschule, Hundesalon', () => {
    expect(PRESENT_PORTAL_TILES.map((tile) => [tile.label, tile.slug])).toEqual([
      ['Portal Tierheim', 'tierheim-sonnenhang'],
      ['Portal Hundeschule', 'hundeschule-pfotenglueck'],
      ['Portal Hundesalon', 'hundesalon-wuschelglueck']
    ])
    for (const tile of PRESENT_PORTAL_TILES) {
      expect(tile.description.length, tile.key).toBeGreaterThan(20)
      expect(tile.icon, tile.key).toBeTruthy()
    }
  })

  test('portalTileUrl: /p/<slug> mit ?demo=1, den Reiter nur, wo die Kachel einen zeigt', () => {
    expect(portalTileUrl({ slug: 'tierheim-sonnenhang', reiter: 'tiere' })).toBe('/p/tierheim-sonnenhang?demo=1&reiter=tiere')
    expect(portalTileUrl({ slug: 'hundesalon-wuschelglueck' })).toBe('/p/hundesalon-wuschelglueck?demo=1')
    expect(PRESENT_PORTAL_TILES.map((tile) => portalTileUrl(tile))).toEqual([
      '/p/tierheim-sonnenhang?demo=1&reiter=tiere',
      '/p/hundeschule-pfotenglueck?demo=1&reiter=termine',
      '/p/hundesalon-wuschelglueck?demo=1'
    ])
  })

  test('direkt aufs Portal, nicht über /demo-start - und nur demo und reiter in der Adresse, keine Codes oder Tokens', () => {
    for (const tile of PRESENT_PORTAL_TILES) {
      const url = new URL(portalTileUrl(tile), 'https://example.org')
      expect(url.pathname).toBe(`/p/${tile.slug}`)
      expect(url.searchParams.get('demo')).toBe('1')
      expect([...url.searchParams.keys()].filter((key) => key !== 'demo' && key !== 'reiter'), tile.key).toEqual([])
      expect(url.hash).toBe('')
    }
  })

  test('jeder Reiter einer Kachel ist ein echter Portal-Reiter (lib/portalTabs.js)', () => {
    const keys = portalTabs({
      posts: [{ id: 1 }],
      termine: [{ datum: '2026-10-10', titel: 'Welpenspielstunde', terminId: 1 }],
      einblicke: [{ fotoUrl: '/public-media/einblick.jpg' }],
      animals: [{ id: 1 }],
      happyEnds: []
    }).map((tab) => tab.key)
    for (const tile of PRESENT_PORTAL_TILES) {
      if (tile.reiter) expect(keys, tile.key).toContain(tile.reiter)
    }
  })
})

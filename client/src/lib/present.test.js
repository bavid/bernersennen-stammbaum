import { describe, expect, test } from 'vitest'
import { DEMO_START_PATH, PRESENT_TILES, demoStartUrl, parseDemoStart, portalPreviewUrl } from './present.js'

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

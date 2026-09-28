import { describe, expect, test } from 'vitest'
import { MAX_NAV_ITEMS, navItemsFor } from './navItems.js'

const labels = (family) => navItemsFor(family).map((item) => item.label)

describe('navItemsFor', () => {
  test('a partner area only gets Profil and Zugang', () => {
    expect(navItemsFor({ art: 'partner' }).map(({ to, label }) => ({ to, label }))).toEqual([
      { to: '/profil', label: 'Profil' },
      { to: '/zugang', label: 'Zugang' }
    ])
  })

  test('a shelter keeps Tiere, Pinnwand, Collage and adds Profil', () => {
    expect(labels({ art: 'tierheim' })).toEqual(['Tiere', 'Pinnwand', 'Collage', 'Profil'])
    expect(navItemsFor({ art: 'tierheim' }).find((item) => item.label === 'Profil').to).toBe('/profil')
  })

  test('households and packs keep their items (no Profil)', () => {
    expect(labels({ art: 'zuhause' })).toEqual(['Wegbegleiter', 'Stammbaum', 'Pinnwand', 'Entdecken', 'Collage'])
    expect(labels({ art: 'rudel' })).toEqual(['Stammbaum', 'Pinnwand', 'Würfe', 'Entdecken', 'Collage'])
  })

  test.each(['zuhause', 'rudel', 'tierheim', 'partner'])('%s never exceeds the mobile bottom bar (at most 5 items)', (art) => {
    expect(navItemsFor({ art }).length).toBeLessThanOrEqual(MAX_NAV_ITEMS)
    expect(MAX_NAV_ITEMS).toBe(5)
  })
})

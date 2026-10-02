import { describe, expect, test } from 'vitest'
import { MAX_NAV_ITEMS, navItemsFor, unreadCount, withUnread } from './navItems.js'
import { getTheme } from '../themes/index.js'

const labels = (family) => navItemsFor(family).map((item) => item.label)

describe('navItemsFor', () => {
  test('zu Besuch in einem anderen Zuhause (Phase V2): nur Wegbegleiter und Familienbande', () => {
    expect(labels({ art: 'zuhause', zuBesuch: true })).toEqual(['Wegbegleiter', 'Familienbande'])
  })

  test('a partner area gets Profil, Beiträge, Nachrichten (Phase P2) and Zugang', () => {
    expect(navItemsFor({ art: 'partner' }).map(({ to, label }) => ({ to, label }))).toEqual([
      { to: '/profil', label: 'Profil' },
      { to: '/beitraege', label: 'Beiträge' },
      { to: '/nachrichten', label: 'Nachrichten' },
      { to: '/zugang', label: 'Zugang' }
    ])
  })

  test('a shelter keeps Tiere, Pinnwand, Collage, adds Profil and Nachrichten - Beiträge live in the Profil tab', () => {
    expect(labels({ art: 'tierheim' })).toEqual(['Tiere', 'Pinnwand', 'Collage', 'Profil', 'Nachrichten'])
    expect(navItemsFor({ art: 'tierheim' }).find((item) => item.label === 'Profil').to).toBe('/profil')
    expect(navItemsFor({ art: 'tierheim' }).find((item) => item.label === 'Nachrichten').to).toBe('/nachrichten')
  })

  test('households and packs keep their items (no Profil) - standard theme: Familienbande, no Nachwuchs tab (Phase U)', () => {
    expect(labels({ art: 'zuhause' })).toEqual(['Wegbegleiter', 'Familienbande', 'Pinnwand', 'Entdecken', 'Collage'])
    expect(labels({ art: 'rudel' })).toEqual(['Familienbande', 'Pinnwand', 'Entdecken', 'Collage'])
    expect(labels({ art: 'rudel', theme: 'standard' })).toEqual(['Familienbande', 'Pinnwand', 'Entdecken', 'Collage'])
    expect(navItemsFor({ art: 'rudel' }).some((item) => item.to === '/wuerfe')).toBe(false)
  })

  test('berner theme keeps Stammbaum and Würfe in the bar, unchanged', () => {
    expect(labels({ art: 'zuhause', theme: 'berner' })).toEqual(['Wegbegleiter', 'Stammbaum', 'Pinnwand', 'Entdecken', 'Collage'])
    expect(labels({ art: 'rudel', theme: 'berner' })).toEqual(['Stammbaum', 'Pinnwand', 'Würfe', 'Entdecken', 'Collage'])
    expect(navItemsFor({ art: 'rudel', theme: 'berner' }).find((item) => item.label === 'Würfe').to).toBe('/wuerfe')
  })

  test('an explicit theme (the one on screen, e.g. a preview) wins over the stored one', () => {
    const rudel = { art: 'rudel', theme: 'standard' }
    expect(navItemsFor(rudel, getTheme('berner')).map((item) => item.label)).toEqual(['Stammbaum', 'Pinnwand', 'Würfe', 'Entdecken', 'Collage'])
    expect(navItemsFor({ ...rudel, theme: 'berner' }, getTheme('standard')).map((item) => item.label)).toEqual([
      'Familienbande',
      'Pinnwand',
      'Entdecken',
      'Collage'
    ])
    expect(navItemsFor(rudel).every((item) => !('labelKey' in item))).toBe(true)
  })

  test.each(['zuhause', 'rudel', 'tierheim', 'partner'])('%s never exceeds the mobile bottom bar (at most 5 items)', (art) => {
    for (const theme of ['standard', 'berner']) {
      expect(navItemsFor({ art, theme }).length).toBeLessThanOrEqual(MAX_NAV_ITEMS)
    }
    expect(MAX_NAV_ITEMS).toBe(5)
  })
})

// Phase P2: ungelesene Nachrichten (me.partner.unread) als Badge an "Nachrichten".
describe('Badge "Nachrichten"', () => {
  const inbox = (family) => navItemsFor(family).find((item) => item.to === '/nachrichten')

  test('mit ungelesenen Nachrichten: Badge und sprechender Name für Screenreader', () => {
    const item = inbox({ art: 'partner', partner: { unread: 2 } })
    expect(item.badge).toBe('2')
    expect(item.ariaLabel).toBe('Nachrichten, 2 ungelesen')
    expect(item.label).toBe('Nachrichten')
  })

  test('auch im Tierheim; ab 100 nur noch "99+"', () => {
    expect(inbox({ art: 'tierheim', partner: { unread: 1 } }).ariaLabel).toBe('Nachrichten, 1 ungelesen')
    expect(inbox({ art: 'tierheim', partner: { unread: 120 } }).badge).toBe('99+')
  })

  test('ohne ungelesene (0, fehlt, kein Partner): kein Badge', () => {
    for (const family of [{ art: 'partner', partner: { unread: 0 } }, { art: 'partner', partner: {} }, { art: 'partner' }]) {
      expect(inbox(family).badge).toBeUndefined()
      expect(inbox(family).ariaLabel).toBeUndefined()
    }
    expect(unreadCount({ partner: { unread: -3 } })).toBe(0)
    expect(unreadCount({ partner: { unread: '2' } })).toBe(0)
  })

  test('andere Einträge bekommen nie ein Badge', () => {
    const others = navItemsFor({ art: 'partner', partner: { unread: 4 } }).filter((item) => item.to !== '/nachrichten')
    expect(others.every((item) => item.badge === undefined)).toBe(true)
  })
})

describe('withUnread', () => {
  test('liefert eine neue family mit der neuen Zahl, ohne die alte zu verändern', () => {
    const family = { id: 30, art: 'partner', partner: { id: 4, name: 'Hundeschule Wiesengrund', unread: 2 } }
    const next = withUnread(family, 1)
    expect(next).not.toBe(family)
    expect(next.partner.unread).toBe(1)
    expect(next.partner.name).toBe('Hundeschule Wiesengrund')
    expect(family.partner.unread).toBe(2)
  })

  test('gleiche Zahl oder kein Partner: dasselbe Objekt', () => {
    const family = { art: 'partner', partner: { unread: 2 } }
    expect(withUnread(family, 2)).toBe(family)
    const household = { art: 'zuhause' }
    expect(withUnread(household, 0)).toBe(household)
    expect(withUnread(null, 1)).toBeNull()
  })
})

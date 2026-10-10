import { describe, expect, test } from 'vitest'
import { MAX_NAV_ITEMS, hasMenuSlot, navItemsFor, unreadCount, withUnread } from './navItems.js'
import { getTheme } from '../themes/index.js'

const labels = (family) => navItemsFor(family).map((item) => item.label)

describe('navItemsFor', () => {
  const household = { art: 'zuhause', home: { id: 1, art: 'zuhause' }, id: 1 }

  // Phase W: Haushalte - im eigenen Zuhause, in einer Familie und zu Besuch - haben überall dieselben vier Punkte.
  test('Haushalte: Start, Tiere, Familien, Entdecken - im Zuhause, in einer Familie und zu Besuch', () => {
    expect(labels(household)).toEqual(['Start', 'Tiere', 'Familien', 'Entdecken'])
    expect(labels({ ...household, id: 5, art: 'rudel' })).toEqual(['Start', 'Tiere', 'Familien', 'Entdecken'])
    expect(labels({ ...household, id: 9, zuBesuch: true })).toEqual(['Start', 'Tiere', 'Familien', 'Entdecken'])
    expect(labels({ art: 'zuhause' })).toEqual(['Start', 'Tiere', 'Familien', 'Entdecken'])
    expect(navItemsFor(household).map((item) => item.to)).toEqual(['/start', '/tiere', '/familien', '/entdecken'])
  })

  test('klassischer Login mit dem Familien-Schlüssel: Start, Tiere, Pinnwand, Entdecken', () => {
    expect(labels({ id: 2, art: 'rudel', home: { id: 2, art: 'rudel' } })).toEqual(['Start', 'Tiere', 'Pinnwand', 'Entdecken'])
    expect(labels({ art: 'rudel' })).toEqual(['Start', 'Tiere', 'Pinnwand', 'Entdecken'])
    expect(navItemsFor({ art: 'rudel' }).find((item) => item.label === 'Pinnwand').to).toBe('/pinnwand')
  })

  // Bestandsrudel aus der alten App (me.stammbaumStart): "Stammbaum" statt "Start" - nur beim klassischen Login.
  test('klassischer Login mit Stammbaum-Start: Stammbaum, Tiere, Pinnwand, Entdecken', () => {
    const rudel = { id: 2, art: 'rudel', home: { id: 2, art: 'rudel' }, stammbaumStart: true }
    expect(labels(rudel)).toEqual(['Stammbaum', 'Tiere', 'Pinnwand', 'Entdecken'])
    expect(navItemsFor(rudel)[0]).toMatchObject({ to: '/stammbaum', icon: 'tree' })
    expect(labels({ ...household, id: 5, art: 'rudel', stammbaumStart: true })).toEqual(['Start', 'Tiere', 'Familien', 'Entdecken'])
  })

  test('ein alter Berner-Wert in family.theme ändert die Wörter nicht mehr (B+ Familienalbum)', () => {
    expect(labels({ ...household, theme: 'berner' })).toEqual(['Start', 'Tiere', 'Familien', 'Entdecken'])
    expect(labels({ art: 'rudel', theme: 'berner' })).toEqual(['Start', 'Tiere', 'Pinnwand', 'Entdecken'])
  })

  test('Hinweis-Glocke: offene Anfragen und neue Gäste tragen kein Badge mehr an „Start“ (keine Doppelung)', () => {
    const item = navItemsFor({ ...household, erlebtMitOffen: 2, neueGaeste: 1, neueGruesse: 3 })[0]
    expect(item.to).toBe('/start')
    expect(item.badge).toBeUndefined()
    expect(item.ariaLabel).toBeUndefined()
  })

  test('a partner area gets Profil, Beiträge, Kalender (Phase V4a), Nachrichten (Phase P2) and Zugang', () => {
    expect(navItemsFor({ art: 'partner' }).map(({ to, label }) => ({ to, label }))).toEqual([
      { to: '/profil', label: 'Profil' },
      { to: '/beitraege', label: 'Beiträge' },
      { to: '/kalender', label: 'Kalender' },
      { to: '/nachrichten', label: 'Nachrichten' },
      { to: '/zugang', label: 'Zugang' }
    ])
  })

  test('a shelter starts with Profil, then Tiere, Pinnwand, Collage, Nachrichten - Beiträge live in the Profil tab', () => {
    expect(labels({ art: 'tierheim' })).toEqual(['Profil', 'Tiere', 'Pinnwand', 'Collage', 'Nachrichten'])
    expect(navItemsFor({ art: 'tierheim' }).find((item) => item.label === 'Profil').to).toBe('/profil')
    expect(navItemsFor({ art: 'tierheim' }).find((item) => item.label === 'Nachrichten').to).toBe('/nachrichten')
  })

  test('the words come from the theme; no labelKey is left in the items', () => {
    const rudel = { art: 'rudel' }
    expect(navItemsFor(rudel, getTheme()).map((item) => item.label)).toEqual(['Start', 'Tiere', 'Pinnwand', 'Entdecken'])
    expect(navItemsFor(rudel).every((item) => !('labelKey' in item))).toBe(true)
  })

  test.each(['zuhause', 'rudel', 'tierheim', 'partner'])('%s never exceeds the mobile bottom bar (at most 5 items)', (art) => {
    expect(navItemsFor({ art }).length).toBeLessThanOrEqual(MAX_NAV_ITEMS)
    expect(MAX_NAV_ITEMS).toBe(5)
  })

  test('Haushalte lassen am Handy Platz für den fünften Punkt „Menü“', () => {
    expect(navItemsFor(household).length + 1).toBeLessThanOrEqual(MAX_NAV_ITEMS)
    expect(hasMenuSlot(household)).toBe(true)
    expect(hasMenuSlot({ art: 'rudel' })).toBe(true)
    expect(hasMenuSlot({ art: 'tierheim' })).toBe(false)
    expect(hasMenuSlot({ art: 'partner' })).toBe(false)
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

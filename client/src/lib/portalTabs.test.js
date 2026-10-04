import { describe, expect, test } from 'vitest'
import {
  CONTACT_TAB,
  OVERVIEW_TAB,
  galleryEinblicke,
  hashTarget,
  initialTermine,
  nextTermine,
  portalCounts,
  portalTabs,
  portalTermine,
  resolvePortalTab,
  tabCountText,
  upcomingTerminCount
} from './portalTabs.js'

const termin = (terminId, datum, extra = {}) => ({ terminId, datum, titel: `Termin ${terminId}`, uhrzeit: '10:00', ...extra })
const einblick = (id, fotoUrl = `/public-media/${String(id).repeat(8)}-1111-1111-1111-111111111111.jpg`) => ({ id, fotoUrl, datum: '2026-09-01' })

describe('portalTermine / nextTermine / upcomingTerminCount', () => {
  const items = [termin(1, '2026-10-03'), termin(1, '2026-10-10', { abgesagt: true }), termin(2, '2026-10-11'), termin(1, '2026-10-17'), termin(3, '2026-10-20')]

  test('portalTermine lässt nur Vorkommen mit Datum und Titel durch', () => {
    expect(portalTermine([...items, null, { datum: 3 }, { datum: '2026-10-01' }])).toHaveLength(5)
    expect(portalTermine(undefined)).toEqual([])
  })

  test('nextTermine: die nächsten n, die stattfinden - abgesagte zählen nicht', () => {
    expect(nextTermine(items, 3).map((item) => item.datum)).toEqual(['2026-10-03', '2026-10-11', '2026-10-17'])
  })

  test('upcomingTerminCount zählt die Tage, die der Reiter zeigt: jede Woche einer Serie, ohne abgesagte, drei Monate', () => {
    const today = '2026-10-01'
    expect(upcomingTerminCount(items, today)).toBe(4)
    const longer = [...items, termin(3, '2026-12-31'), termin(5, '2027-01-02')]
    expect(upcomingTerminCount(longer, today)).toBe(5)
    expect(upcomingTerminCount([termin(4, '2026-10-03', { abgesagt: true })], today)).toBe(0)
  })

  test('initialTermine: das Fenster der Liste - drei Monate, sonst (nichts findet darin statt) alle', () => {
    const today = '2026-10-01'
    const later = [termin(6, '2027-02-01'), termin(6, '2027-02-08')]
    expect(initialTermine([...items, ...later], today)).toHaveLength(5)
    expect(initialTermine(later, today)).toEqual(later)
    const onlyCancelled = [termin(7, '2026-10-05', { abgesagt: true }), ...later]
    expect(initialTermine(onlyCancelled, today)).toEqual(onlyCancelled)
    expect(upcomingTerminCount(later, today)).toBe(2)
  })
})

describe('galleryEinblicke', () => {
  test('öffentlich nur /public-media, in der Kundensicht auch /uploads', () => {
    const list = [einblick(1), einblick(2, '/uploads/22222222-2222-2222-2222-222222222222.jpg'), einblick(3, 'https://fremd.example/x.jpg'), null]
    expect(galleryEinblicke(list).map((item) => item.id)).toEqual([1])
    expect(galleryEinblicke(list, { preview: true }).map((item) => item.id)).toEqual([1, 2])
  })
})

describe('portalTabs / portalCounts', () => {
  const data = {
    posts: [{ id: 1 }, { id: 2 }],
    termine: [termin(1, '2026-10-03'), termin(1, '2026-10-10')],
    einblicke: [einblick(1)],
    animals: [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }],
    happyEnds: [],
    today: '2026-10-01'
  }

  test('alles da: Übersicht, Tiere, Angebote, Termine, Einblicke, Kontakt - Tiere gleich nach der Übersicht', () => {
    expect(portalTabs(data).map((tab) => tab.label)).toEqual(['Übersicht', 'Tiere', 'Angebote', 'Termine', 'Einblicke', 'Kontakt'])
    expect(portalCounts(data)).toEqual({ tiere: 3, angebote: 2, termine: 2, einblicke: 1 })
  })

  test('leere Reiter fehlen - nur Übersicht und Kontakt stehen immer da', () => {
    expect(portalTabs({}).map((tab) => tab.key)).toEqual([OVERVIEW_TAB, CONTACT_TAB])
    expect(portalCounts({})).toEqual({})
  })

  test('kontakt: false (angemeldet, ohne jeden Kontaktweg) - dann fehlt auch der Reiter Kontakt', () => {
    expect(portalTabs({ kontakt: false }).map((tab) => tab.key)).toEqual([OVERVIEW_TAB])
    expect(portalTabs({ kontakt: true }).map((tab) => tab.key)).toEqual([OVERVIEW_TAB, CONTACT_TAB])
  })

  test('nur Happy Ends: der Reiter Tiere steht da, ohne Zähler', () => {
    const tabs = portalTabs({ happyEnds: [{ name: 'Nele' }] })
    expect(tabs.map((tab) => tab.key)).toEqual([OVERVIEW_TAB, 'tiere', CONTACT_TAB])
    expect(portalCounts({ happyEnds: [{ name: 'Nele' }] })).toEqual({})
  })

  test('Einblicke zählen nur, was die Galerie auch zeigt (in der Kundensicht /uploads)', () => {
    const uploads = [einblick(9, '/uploads/99999999-9999-9999-9999-999999999999.jpg')]
    expect(portalTabs({ einblicke: uploads }).map((tab) => tab.key)).not.toContain('einblicke')
    expect(portalTabs({ einblicke: uploads, preview: true }).map((tab) => tab.key)).toContain('einblicke')
  })

  test('tabCountText liest den Zähler in Worten vor', () => {
    expect(tabCountText(1, 'angebote')).toBe('1 Angebot')
    expect(tabCountText(4, 'termine')).toBe('4 Termine')
    expect(tabCountText(1, 'einblicke')).toBe('1 Einblick')
    expect(tabCountText(5, 'tiere')).toBe('5 Tiere')
  })
})

describe('hashTarget / resolvePortalTab', () => {
  const keys = [OVERVIEW_TAB, 'tiere', 'angebote', 'termine', CONTACT_TAB]

  test('alte Sprungmarken führen zum passenden Reiter samt Abschnitt', () => {
    expect(hashTarget('#kontakt')).toEqual({ tab: CONTACT_TAB, target: 'partner-portal-contact' })
    expect(hashTarget('#partner-portal-contact')).toEqual({ tab: CONTACT_TAB, target: 'partner-portal-contact' })
    expect(hashTarget('#gutschein')).toEqual({ tab: CONTACT_TAB, target: 'partner-portal-gutschein' })
    expect(hashTarget('#partner-portal-termine')).toEqual({ tab: 'termine', target: 'partner-portal-termine' })
    expect(hashTarget('#portal-einblicke')).toEqual({ tab: 'einblicke', target: 'portal-einblicke' })
    expect(hashTarget('#partner-portal-happy-ends')).toEqual({ tab: 'tiere', target: 'partner-portal-happy-ends' })
    expect(hashTarget('#Angebote')).toEqual({ tab: 'angebote', target: 'partner-portal-posts' })
    expect(hashTarget('#unbekannt')).toBeNull()
    expect(hashTarget('')).toBeNull()
    expect(hashTarget('#%E0%A4%A')).toBeNull()
  })

  test('?reiter= gewinnt, sonst die Sprungmarke, sonst die Übersicht', () => {
    expect(resolvePortalTab({ param: 'termine', hash: '#kontakt', keys })).toBe('termine')
    expect(resolvePortalTab({ param: null, hash: '#kontakt', keys })).toBe(CONTACT_TAB)
    expect(resolvePortalTab({ param: null, hash: '', keys })).toBe(OVERVIEW_TAB)
  })

  test('unbekannte oder leere Reiter landen bei der Übersicht', () => {
    expect(resolvePortalTab({ param: '<script>', hash: '', keys })).toBe(OVERVIEW_TAB)
    expect(resolvePortalTab({ param: 'constructor', hash: '', keys })).toBe(OVERVIEW_TAB)
    expect(resolvePortalTab({ param: 'einblicke', hash: '#einblicke', keys })).toBe(OVERVIEW_TAB)
  })
})

import { describe, expect, test } from 'vitest'
import {
  appendPage,
  areaChipLabel,
  feedEntries,
  feedEntryLink,
  feedKey,
  feedNoteLink,
  homeEntries,
  pinboardNews,
  toFeedItem,
  upcomingTermine
} from './startFeed.js'
import { byMemoryDate } from './feed.js'

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'eigen' }
const family = { id: 5, name: 'Familie Sonnenhang', art: 'familie' }
const visit = { id: 8, name: 'Zuhause Möwenweg', art: 'besuch' }

describe('lib/startFeed (Phase W, Schritt 3)', () => {
  test('toFeedItem: das Tier flach für die Karte, Zettel bleiben, wie sie sind', () => {
    const entry = toFeedItem({ type: 'eintrag', id: 3, dog: { id: 10, name: 'Nele', name_unbekannt: false, rasse: 'Mix', foto_url: '/uploads/n.jpg' } })
    expect(entry).toMatchObject({ dog_id: 10, dog_name: 'Nele', dog_name_unbekannt: false, dog_rasse: 'Mix', dog_foto_url: '/uploads/n.jpg' })
    const note = { type: 'zettel', id: 3, text: 'Hallo' }
    expect(toFeedItem(note)).toBe(note)
  })

  test('feedKey: Erinnerungen und Zettel mit gleicher Id bleiben getrennt', () => {
    expect(feedKey({ type: 'eintrag', id: 3 })).toBe('eintrag-3')
    expect(feedKey({ type: 'zettel', id: 3 })).toBe('zettel-3')
    expect(feedKey({ id: 3 })).toBe('eintrag-3')
  })

  test('areaChipLabel: Familie mit Namen, Besuch mit „Zu Besuch:“, das eigene Zuhause ohne', () => {
    expect(areaChipLabel(family)).toBe('Familie Sonnenhang')
    expect(areaChipLabel(visit)).toBe('Zu Besuch: Zuhause Möwenweg')
    expect(areaChipLabel(home)).toBeNull()
    expect(areaChipLabel(undefined)).toBeNull()
    expect(areaChipLabel({ id: 9, art: 'irgendwas', name: 'X' })).toBeNull()
  })

  test('Links: Tierseite im Bereich der Karte, Zettel zur Pinnwand dort - Ids kodiert', () => {
    expect(feedEntryLink({ id: 7, dog_id: 10, area: family })).toBe('/tier/10?in=5#entry-7')
    expect(feedEntryLink({ id: 7, dog_id: 10 })).toBe('/tier/10#entry-7')
    expect(feedEntryLink({ id: '7?x', dog_id: '1/2', area: { id: '5&a', art: 'familie' } })).toBe('/tier/1%2F2?in=5%26a#entry-7%3Fx')
    expect(feedNoteLink({ area: home })).toBe('/pinnwand?in=home')
    expect(feedNoteLink({ area: family })).toBe('/familien/5?reiter=pinnwand')
  })

  test('byMemoryDate: nach dem Tag der Erinnerung, am selben Tag die zuletzt aktive, ohne Tag ans Ende', () => {
    const items = [
      { type: 'eintrag', id: 1, datum: '2026-07-14', activity_at: '2026-09-28 10:00:00' },
      { type: 'eintrag', id: 2, datum: '2026-09-27', activity_at: '2026-09-27 08:00:00' },
      { type: 'eintrag', id: 3, datum: null, activity_at: '2026-09-30 08:00:00' },
      { type: 'eintrag', id: 4, datum: '2026-09-27', activity_at: '2026-09-29 08:00:00' }
    ]
    expect(byMemoryDate(items).map((item) => item.id)).toEqual([4, 2, 1, 3])
  })

  test('upcomingTermine: ohne Vergangenes (nach der Uhr des Geräts), höchstens drei', () => {
    const termine = ['2026-09-27', '2026-09-28', '2026-10-01', '2026-10-02', '2026-10-03'].map((termin_datum, id) => ({ id, termin_datum }))
    expect(upcomingTermine(termine, '2026-09-28').map((termin) => termin.id)).toEqual([1, 2, 3])
    expect(upcomingTermine(undefined, '2026-09-28')).toEqual([])
  })

  test('pinboardNews und feedEntries: Zettel getrennt vom Album, ohne die Termine unter „Bald“', () => {
    const items = [
      { type: 'zettel', id: 1, area: home },
      { type: 'eintrag', id: 1, area: home },
      { type: 'zettel', id: 1, area: family },
      { type: 'zettel', id: 2, area: home },
      { type: 'zettel', id: 3, area: home },
      { type: 'zettel', id: 4, area: home }
    ]
    expect(pinboardNews(items, [{ id: 1, area: home }]).map(feedKey)).toEqual(['zettel-1', 'zettel-2'])
    expect(pinboardNews(items, [{ id: 1, area: home }])[0].area).toBe(family)
    expect(feedEntries(items).map(feedKey)).toEqual(['eintrag-1'])
    expect(pinboardNews(undefined)).toEqual([])
  })

  test('appendPage: schon Geladenes nicht doppelt, neue Liste', () => {
    const first = [{ type: 'eintrag', id: 1 }, { type: 'zettel', id: 2 }]
    const result = appendPage(first, [{ type: 'eintrag', id: 1 }, { type: 'eintrag', id: 2 }])
    expect(result.map(feedKey)).toEqual(['eintrag-1', 'zettel-2', 'eintrag-2'])
    expect(first).toHaveLength(2)
  })

  test('homeEntries: nur Erinnerungen des eigenen Zuhauses', () => {
    const items = [
      { type: 'eintrag', id: 1, area: home },
      { type: 'eintrag', id: 2, area: family },
      { type: 'zettel', id: 3, area: home },
      { type: 'eintrag', id: 4 }
    ]
    expect(homeEntries(items).map((item) => item.id)).toEqual([1, 4])
    expect(homeEntries(undefined)).toEqual([])
  })
})

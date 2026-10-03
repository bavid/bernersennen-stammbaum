import { describe, expect, test } from 'vitest'
import { MAX_STICKERS, STICKERS, STICKER_GROUPS, getSticker, isStickerId, stickerLabels, stickerUrl, stickersOfGroup } from './stickers.js'

describe('Sticker-Liste', () => {
  test('rund 40 Sticker mit eindeutigen, URL-sicheren Ids', () => {
    expect(STICKERS.length).toBeGreaterThanOrEqual(40)
    const ids = STICKERS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9-]+$/))
  })

  test('jeder Sticker hat ein deutsches Label und eine der vier Gruppen', () => {
    expect(STICKER_GROUPS.map((g) => g.label)).toEqual(['Tiere', 'Herzen & Feiern', 'Natur', 'Gesichter'])
    const groupIds = new Set(STICKER_GROUPS.map((g) => g.id))
    STICKERS.forEach((sticker) => {
      expect(sticker.label.trim().length).toBeGreaterThan(1)
      expect(groupIds.has(sticker.group)).toBe(true)
    })
    STICKER_GROUPS.forEach((group) => expect(stickersOfGroup(group.id).length).toBeGreaterThanOrEqual(5))
  })

  test('die gewünschten Motive sind dabei', () => {
    for (const id of ['hundegesicht', 'katzengesicht', 'pfoten', 'knochen', 'herz-rot', 'stern', 'funkeln', 'sonne', 'regenbogen',
      'luftballon', 'konfetti', 'torte', 'geschenk', 'kamera', 'haus', 'baum', 'tulpe', 'schneeflocke', 'krone', 'pokal',
      'medaille', 'lachen', 'daumen-hoch']) {
      expect(isStickerId(id)).toBe(true)
    }
  })

  test('URL zeigt auf die lokal mitgelieferte Datei, nie auf einen fremden Server', () => {
    expect(stickerUrl('pfoten')).toBe('/stickers/pfoten.svg')
    expect(getSticker('pfoten').label).toBe('Pfotenabdrücke')
    expect(getSticker('gibt-es-nicht')).toBeNull()
    expect(isStickerId('../index')).toBe(false)
    expect(isStickerId(undefined)).toBe(false)
  })

  test('höchstens 30 Sticker je Seite', () => {
    expect(MAX_STICKERS).toBe(30)
  })
})

describe('stickerLabels', () => {
  test('gleiche Sticker werden durchnummeriert, einzelne nicht', () => {
    const placed = [{ sticker: 'stern' }, { sticker: 'krone' }, { sticker: 'stern' }, { sticker: 'stern' }]
    expect(stickerLabels(placed)).toEqual(['Stern 1', 'Krone', 'Stern 2', 'Stern 3'])
    expect(stickerLabels([])).toEqual([])
  })
})

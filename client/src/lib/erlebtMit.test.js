import { describe, expect, test } from 'vitest'
import { canVisitOrigin, mirrorLabel, requestQuestion, tagLabel, taggedDogIds, withErlebtMitOffen } from './erlebtMit.js'

describe('lib/erlebtMit (Phase V2)', () => {
  test('tagLabel: bestätigt und angefragt', () => {
    expect(tagLabel({ name: 'Wilma', status: 'bestaetigt' })).toBe('erlebt mit Wilma')
    expect(tagLabel({ name: 'Wilma', status: 'offen' })).toBe('erlebt mit Wilma (angefragt)')
    expect(tagLabel({ name: 'Unbekannt', nameUnbekannt: true, status: 'bestaetigt' })).toBe('erlebt mit Unbekannt')
  })

  test('requestQuestion und mirrorLabel', () => {
    expect(requestQuestion({ dogName: 'Wilma' })).toBe('Wilma war dabei – übernehmen?')
    expect(mirrorLabel({ tier: 'Balu', zuhause: 'Zuhause am Deich' })).toBe('erlebt mit Balu · Zuhause am Deich')
  })

  test('canVisitOrigin: nur besuchte Zuhause', () => {
    const family = { besuche: [{ id: 9, name: 'Zuhause Möwenweg' }] }
    expect(canVisitOrigin(family, { zuhauseId: 9 })).toBe(true)
    expect(canVisitOrigin(family, { zuhauseId: 4 })).toBe(false)
    expect(canVisitOrigin({}, { zuhauseId: 9 })).toBe(false)
  })

  test('withErlebtMitOffen: neue Zahl, gleiche Zahl dasselbe Objekt', () => {
    const family = { id: 1, erlebtMitOffen: 2 }
    expect(withErlebtMitOffen(family, 1)).toEqual({ id: 1, erlebtMitOffen: 1 })
    expect(withErlebtMitOffen(family, 2)).toBe(family)
  })

  test('taggedDogIds', () => {
    expect(taggedDogIds({ erlebt_mit: [{ dogId: 3 }, { dogId: 5 }] })).toEqual([3, 5])
    expect(taggedDogIds(undefined)).toEqual([])
  })
})

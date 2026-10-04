import { describe, expect, test } from 'vitest'
import { canVisitOrigin, mirrorLabel, requestGroups, tagLabel, taggedDogIds } from './erlebtMit.js'

describe('lib/erlebtMit (Phase V2)', () => {
  test('tagLabel: bestätigt und angefragt', () => {
    expect(tagLabel({ name: 'Wilma', status: 'bestaetigt' })).toBe('mit dabei: Wilma')
    expect(tagLabel({ name: 'Wilma', status: 'offen' })).toBe('mit dabei: Wilma (angefragt)')
    expect(tagLabel({ name: 'Unbekannt', nameUnbekannt: true, status: 'bestaetigt' })).toBe('mit dabei: Unbekannt')
  })

  test('mirrorLabel', () => {
    expect(mirrorLabel({ tier: 'Balu', zuhause: 'Zuhause am Deich' })).toBe('mit dabei: Balu · Zuhause am Deich')
  })

  test('canVisitOrigin: nur besuchte Zuhause', () => {
    const family = { besuche: [{ id: 9, name: 'Zuhause Möwenweg' }] }
    expect(canVisitOrigin(family, { zuhauseId: 9 })).toBe(true)
    expect(canVisitOrigin(family, { zuhauseId: 4 })).toBe(false)
    expect(canVisitOrigin({}, { zuhauseId: 9 })).toBe(false)
  })

  test('taggedDogIds - ohne getrennte', () => {
    expect(taggedDogIds({ erlebt_mit: [{ dogId: 3 }, { dogId: 5 }, { id: 9, getrennt: true }] })).toEqual([3, 5])
    expect(taggedDogIds(undefined)).toEqual([])
  })

  test('getrennte Markierung ohne Namen (security-review V2)', () => {
    expect(tagLabel({ id: 9, status: 'bestaetigt', getrennt: true })).toBe('mit dabei: ein früher verbundenes Tier')
  })

  test('requestGroups: nur Zuhause mit mindestens zwei Anfragen', () => {
    const requests = [
      { requestId: 1, zuhauseId: 4, zuhause: 'Zuhause A' },
      { requestId: 2, zuhauseId: 4, zuhause: 'Zuhause A' },
      { requestId: 3, zuhauseId: 7, zuhause: 'Zuhause B' }
    ]
    expect(requestGroups(requests)).toEqual([{ zuhauseId: 4, zuhause: 'Zuhause A', count: 2 }])
  })
})

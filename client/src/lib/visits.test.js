// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { isOwnHome, isVisit, visitLabel, voucherLink } from './visits.js'

const home = { id: 1, name: 'Zuhause am Deich', art: 'zuhause' }

describe('lib/visits (Phase V2)', () => {
  test('voucherLink: /v#CODE ohne Bindestriche', () => {
    expect(voucherLink('ABCD-EFGH-JKMN')).toBe(`${window.location.origin}/v#ABCDEFGHJKMN`)
  })

  test('visitLabel', () => {
    expect(visitLabel('Zuhause Möwenweg')).toBe('Zu Besuch bei Zuhause Möwenweg')
  })

  test('isVisit folgt me.zuBesuch', () => {
    expect(isVisit({ zuBesuch: true })).toBe(true)
    expect(isVisit({})).toBe(false)
    expect(isVisit(null)).toBe(false)
  })

  test('isOwnHome: nur das eigene Zuhause, nicht in einer Familie oder zu Besuch', () => {
    expect(isOwnHome({ ...home, home })).toBe(true)
    expect(isOwnHome({ id: 3, art: 'rudel', home })).toBe(false)
    expect(isOwnHome({ id: 9, art: 'zuhause', home, zuBesuch: true })).toBe(false)
    expect(isOwnHome({ id: 3, art: 'rudel' })).toBe(false)
  })
})

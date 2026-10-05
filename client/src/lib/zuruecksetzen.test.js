// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { UNSERE_EINSTELLUNGEN, anleitungFuer, forgetOurSettings } from './zuruecksetzen.js'
import { readSetting, writeSetting } from './storage.js'

afterEach(() => window.localStorage.clear())

describe('zuruecksetzen', () => {
  test('forgetOurSettings vergisst PLZ, Umkreis, gemerkten Standort und weggeklickte Hinweise - sonst nichts', () => {
    for (const key of UNSERE_EINSTELLUNGEN) writeSetting(key, 'x')
    writeSetting('darstellung', { palette: 'wald' })
    forgetOurSettings()
    for (const key of UNSERE_EINSTELLUNGEN) expect(readSetting(key, null)).toBe(null)
    expect(readSetting('darstellung', null)).toEqual({ palette: 'wald' })
  })

  test('anleitungFuer: je Gerät zwei Wege, Unbekanntes wie PC', () => {
    expect(anleitungFuer('android').join(' ')).toMatch(/Seiteninfo.*Berechtigungen/)
    expect(anleitungFuer('ios').join(' ')).toMatch(/Safari/)
    expect(anleitungFuer('ios').join(' ')).toMatch(/Mitteilungen/)
    expect(anleitungFuer('desktop')).toHaveLength(2)
    expect(anleitungFuer('toaster')).toBe(anleitungFuer('desktop'))
  })
})

import { describe, expect, test } from 'vitest'
import { AKZENT_VORSCHLAEGE, accentFor, akzentFarben } from './akzent.js'
import { PALETTE_FLAECHEN } from './paletteFlaechen.js'
import { contrastRatio } from './contrast.js'
import { isValidHexColor } from './color.js'

const AA = 4.5
const album = PALETTE_FLAECHEN.familienalbum

// Jede Fläche der Farbwelt, auf der die Akzentfarbe als Link steht, und die Schrift auf dem Knopf.
function passes(result, flaechen) {
  const backgrounds = [flaechen.paper, flaechen.surface, flaechen.sunk, flaechen.deep, flaechen.hero, '#ffffff']
  const onLight = flaechen.scheme === 'hell'
  return (
    backgrounds.filter((bg) => onLight || bg !== '#ffffff').every((bg) => contrastRatio(result.farbe, bg) >= AA) &&
    contrastRatio(result.auf, result.farbe) >= AA &&
    contrastRatio(result.auf, result.tief) >= AA
  )
}

describe('accentFor – eigene Akzentfarbe mit automatischer Lesbarkeit', () => {
  test('eine dunkle Farbe bleibt im hellen Modus wie sie ist', () => {
    const result = accentFor('#2f4a7a', album.hell)
    expect(result.farbe).toBe('#2f4a7a')
    expect(result.angepasst).toBe(false)
    expect(passes(result, album.hell)).toBe(true)
  })

  test('eine zu helle Farbe wird im hellen Modus dunkler, bis Text und Knopf lesbar sind - „angepasst“', () => {
    const result = accentFor('#f2c94c', album.hell)
    expect(result.angepasst).toBe(true)
    expect(result.farbe).not.toBe('#f2c94c')
    expect(passes(result, album.hell)).toBe(true)
  })

  test('im dunklen Modus wird eine dunkle Farbe heller, mit dunkler Schrift auf dem Knopf', () => {
    const result = accentFor('#2f4a7a', album.dunkel)
    expect(result.angepasst).toBe(true)
    expect(result.auf).toBe(album.dunkel.onRust)
    expect(passes(result, album.dunkel)).toBe(true)
  })

  test('der Hover-Ton (tief) ist im hellen Modus dunkler, im dunklen heller - beide bleiben lesbar', () => {
    const light = accentFor('#a64b2a', album.hell)
    const dark = accentFor('#a64b2a', album.dunkel)
    expect(contrastRatio(light.tief, '#ffffff')).toBeGreaterThan(contrastRatio(light.farbe, '#ffffff'))
    expect(contrastRatio(dark.tief, album.dunkel.paper)).toBeGreaterThan(contrastRatio(dark.farbe, album.dunkel.paper))
  })

  test('Extremfälle: Weiß, Schwarz und Grau landen immer bei einer lesbaren Farbe', () => {
    for (const hex of ['#ffffff', '#000000', '#808080', '#ff0000', '#00ff00']) {
      for (const scheme of ['hell', 'dunkel']) {
        const result = accentFor(hex, album[scheme])
        expect(isValidHexColor(result.farbe), `${hex} ${scheme}`).toBe(true)
        expect(passes(result, album[scheme]), `${hex} ${scheme}`).toBe(true)
      }
    }
  })
})

describe('akzentFarben – beide Modi für eine Farbwelt', () => {
  test('liefert hell und dunkel, jede Farbe #rrggbb; Großbuchstaben werden klein', () => {
    const farben = akzentFarben('#C8553A', 'wald')
    for (const scheme of ['hell', 'dunkel']) {
      for (const key of ['farbe', 'tief', 'auf']) expect(isValidHexColor(farben[scheme][key]), `${scheme}.${key}`).toBe(true)
      expect(passes(farben[scheme], PALETTE_FLAECHEN.wald[scheme])).toBe(true)
    }
  })

  test('ohne gültige Farbe nichts (null) - nie ein roher Wert in eine CSS-Variable', () => {
    expect(akzentFarben('', 'familienalbum')).toBeNull()
    expect(akzentFarben('red', 'familienalbum')).toBeNull()
    expect(akzentFarben('#abc;}', 'familienalbum')).toBeNull()
  })

  test('eine unbekannte Farbwelt rechnet mit den Flächen des Familienalbums', () => {
    expect(akzentFarben('#3f6e8c', 'gibtsnicht')).toEqual(akzentFarben('#3f6e8c', 'familienalbum'))
  })

  test('sechs Vorschläge, alle gültig und verschieden', () => {
    expect(AKZENT_VORSCHLAEGE).toHaveLength(6)
    expect(new Set(AKZENT_VORSCHLAEGE.map((option) => option.farbe)).size).toBe(6)
    for (const option of AKZENT_VORSCHLAEGE) {
      expect(isValidHexColor(option.farbe)).toBe(true)
      expect(option.label).toMatch(/\S/)
    }
  })
})

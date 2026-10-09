import { describe, expect, test } from 'vitest'
import { FOLIEN, FOLIE_PARAM, clampFolie, folieAusSuche } from './vorstellung.js'

describe('vorstellung – Folien', () => {
  test('es gibt zehn Folien mit eindeutiger Kennung und Titel', () => {
    expect(FOLIEN).toHaveLength(10)
    expect(new Set(FOLIEN.map((f) => f.id)).size).toBe(10)
    FOLIEN.forEach((f) => expect(f.title).toBeTruthy())
  })

  test('die Texte vermeiden verbotene Wörter', () => {
    const text = JSON.stringify(FOLIEN)
    expect(text).not.toMatch(/ohne Werbung|für immer|vorerst/i)
    expect(text).toMatch(/heute kostenlos/i)
  })
})

describe('vorstellung – clampFolie', () => {
  test('liefert 1 für ungültige Werte', () => {
    for (const v of [undefined, null, '', 'abc', NaN, 0, -3]) expect(clampFolie(v, 10)).toBe(1)
  })
  test('begrenzt nach oben auf die letzte Folie', () => {
    expect(clampFolie('99', 10)).toBe(10)
    expect(clampFolie(11, 10)).toBe(10)
  })
  test('lässt gültige Werte durch, auch als Text', () => {
    expect(clampFolie('4', 10)).toBe(4)
    expect(clampFolie(10, 10)).toBe(10)
  })
})

describe('vorstellung – folieAusSuche', () => {
  test('liest ?folie=N und begrenzt', () => {
    expect(FOLIE_PARAM).toBe('folie')
    expect(folieAusSuche('?folie=3')).toBe(3)
    expect(folieAusSuche('?folie=99')).toBe(FOLIEN.length)
    expect(folieAusSuche('?folie=x')).toBe(1)
    expect(folieAusSuche('')).toBe(1)
  })
})

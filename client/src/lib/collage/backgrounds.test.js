import { describe, expect, test } from 'vitest'
import { contrastRatio } from '../contrast.js'
import {
  BACKGROUNDS,
  BACKGROUND_GROUPS,
  DEFAULT_BACKGROUND,
  backgroundTileUrl,
  buildTile,
  getBackground,
  isBackgroundId
} from './backgrounds.js'

describe('Hintergründe', () => {
  test('Muster, helle und dunkle Farben mit eindeutigen Ids', () => {
    const ids = BACKGROUNDS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(BACKGROUND_GROUPS.map((g) => g.label)).toEqual(['Muster', 'Hell', 'Dunkel'])
    expect(BACKGROUNDS.filter((b) => b.group === 'muster').map((b) => b.label)).toEqual(['Pfoten', 'Herzen', 'Papier'])
    expect(BACKGROUNDS.filter((b) => b.group === 'hell').length).toBeGreaterThanOrEqual(4)
    expect(BACKGROUNDS.filter((b) => b.group === 'dunkel').length).toBeGreaterThanOrEqual(2)
  })

  test('Standard ist das bisherige Papier-Creme - alte Entwürfe sehen unverändert aus', () => {
    expect(DEFAULT_BACKGROUND).toBe('creme')
    expect(getBackground('creme')).toMatchObject({ paper: '#f6efe4', ink: '#1c1511', muted: '#74665a', frame: '#ecdfcc', accent: '#a4431d' })
    expect(getBackground(undefined).id).toBe('creme')
    expect(getBackground('neon').id).toBe('creme')
    expect(isBackgroundId('papier')).toBe(true)
    expect(isBackgroundId('neon')).toBe(false)
  })

  test.each(BACKGROUNDS.map((b) => [b.id, b]))('%s: Schrift bleibt gut lesbar', (_, bg) => {
    expect(contrastRatio(bg.ink, bg.paper)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(bg.muted, bg.paper)).toBeGreaterThanOrEqual(3.5)
    expect(contrastRatio(bg.accent, bg.paper)).toBeGreaterThanOrEqual(3)
  })

  test('dunkle Hintergründe haben helle Schrift', () => {
    BACKGROUNDS.filter((b) => b.group === 'dunkel').forEach((bg) => {
      expect(contrastRatio(bg.ink, '#ffffff')).toBeLessThan(1.3)
    })
  })
})

describe('Muster-Kacheln', () => {
  const patterns = BACKGROUNDS.filter((b) => b.tile)

  test('nur die Muster haben eine Kachel, Farben nicht', () => {
    expect(patterns.map((b) => b.id)).toEqual(['pfoten', 'herzen', 'papier'])
    expect(backgroundTileUrl(getBackground('creme'))).toBeNull()
  })

  test.each(patterns.map((b) => [b.id, b]))('%s: selbst gezeichnetes, quadratisches SVG ohne externe Verweise', (_, bg) => {
    const { svg, size } = bg.tile
    expect(size).toBeGreaterThan(40)
    expect(Number.isInteger(size)).toBe(true)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain(`width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"`)
    expect(svg).not.toMatch(/<script|href|\son\w+=|<image|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i)
  })

  test('Kachel-URL ist ein eingebettetes data:-SVG (kein Netzwerkzugriff, gleich in Vorschau und Export)', () => {
    const url = backgroundTileUrl(getBackground('pfoten'))
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(url.split(',')[1])).toBe(getBackground('pfoten').tile.svg)
  })

  test('die Papier-Struktur ist bei jedem Aufbau gleich (feste Zufallsfolge)', () => {
    expect(buildTile('papier').svg).toBe(buildTile('papier').svg)
    expect(buildTile('papier').svg).toBe(getBackground('papier').tile.svg)
    expect(buildTile('creme')).toBeNull()
  })
})

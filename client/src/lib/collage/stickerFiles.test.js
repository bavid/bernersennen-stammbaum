// Prüft die mitgelieferten Sticker-Dateien (client/public/stickers, Fluent Emoji Flat, MIT): jede Datei der Liste
// ist da, es liegen keine fremden SVGs daneben, und keine Datei enthält Skripte, Ereignis-Attribute oder Verweise
// auf fremde Server - die SVGs werden als Bild, im Canvas-Export und notfalls direkt im Browser geöffnet.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { STICKERS } from './stickers.js'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../public/stickers')
const svgFiles = readdirSync(DIR).filter((name) => name.endsWith('.svg'))
const read = (name) => readFileSync(join(DIR, name), 'utf8')

const FORBIDDEN = [
  ['<script', /<script/i],
  ['href="http', /href\s*=\s*["']\s*https?:/i],
  ['xlink:href="http', /xlink:href\s*=\s*["']\s*https?:/i],
  ['on…= (Ereignis-Attribut)', /\son\w+\s*=/i],
  ['<foreignObject', /<foreignObject/i],
  ['<image (eingebettete Bilder)', /<image\b/i],
  ['javascript:', /javascript:/i],
  ['@import / externe CSS', /@import|url\(\s*["']?\s*(https?:|\/\/)/i]
]

describe('mitgelieferte Sticker-Dateien', () => {
  test('Liste und Dateien stimmen genau überein', () => {
    expect(svgFiles.sort()).toEqual(STICKERS.map((s) => `${s.id}.svg`).sort())
  })

  test('Lizenztext (MIT, Microsoft) und Quellenangabe liegen bei', () => {
    const license = readFileSync(join(DIR, 'LICENSE.txt'), 'utf8')
    expect(license).toContain('MIT License')
    expect(license).toContain('Copyright (c) Microsoft Corporation')
    const sources = readFileSync(join(DIR, 'QUELLEN.md'), 'utf8')
    STICKERS.forEach((s) => expect(sources).toContain(`${s.id}.svg`))
  })

  test.each(svgFiles)('%s ist ein schlichtes, quadratisches SVG', (name) => {
    const svg = read(name)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toMatch(/viewBox="0 0 32 32"/)
    expect(svg).toMatch(/width="32" height="32"/)
    expect(svg.length).toBeLessThan(8000)
  })

  test.each(svgFiles)('%s enthält keine Skripte und keine externen Verweise', (name) => {
    const svg = read(name)
    for (const [label, pattern] of FORBIDDEN) {
      expect(pattern.test(svg), `${name}: ${label}`).toBe(false)
    }
  })

  test('der Scan schlägt bei gefährlichem Inhalt tatsächlich an', () => {
    const bad = '<svg onload="x()"><a xlink:href="http://evil.test"><script>1</script></a></svg>'
    expect(FORBIDDEN.filter(([, pattern]) => pattern.test(bad)).length).toBeGreaterThanOrEqual(3)
  })
})

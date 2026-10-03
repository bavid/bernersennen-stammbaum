// Vorschau (CSS) und Export (Canvas) müssen dieselben Maße nutzen. Wo die Vorschau feste Werte im CSS trägt,
// vergleicht dieser Test sie mit den Konstanten des Exports.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { PAGE } from './layout.js'
import { POLAROID } from './layouts.js'
import { DOT_RING, SHADOW } from './renderDesign.js'

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../styles/collage-design.css'), 'utf8')
const cqw = (units) => Number(((units / PAGE.width) * 100).toFixed(4))
const ruleOf = (selector) => css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)))
const number = (text, pattern) => Number(text.match(pattern)[1])

describe('Vorschau = Export', () => {
  test('Polaroid-Unterschrift sitzt im Rand wie das Foto (links/rechts)', () => {
    const inset = (POLAROID.border / (1 + 2 * POLAROID.border)) * 100
    expect(number(ruleOf('.cpolaroid-caption'), /left: ([\d.]+)%/)).toBeCloseTo(inset, 2)
    expect(number(ruleOf('.cpolaroid-caption'), /right: ([\d.]+)%/)).toBeCloseTo(inset, 2)
  })

  test('Polaroid-Schatten: Versatz und Weichzeichnung', () => {
    const rule = ruleOf('.cpolaroid')
    expect(number(rule, /box-shadow: 0 ([\d.]+)cqw/)).toBeCloseTo(cqw(SHADOW.offsetY), 3)
    expect(number(rule, /box-shadow: 0 [\d.]+cqw ([\d.]+)cqw/)).toBeCloseTo(cqw(SHADOW.blur), 3)
    expect(rule).toContain(SHADOW.color)
  })

  test('Zeitstrahl-Punkt: Ring in Papierfarbe, so breit wie im Export', () => {
    expect(number(ruleOf('.ctl-dot'), /border: ([\d.]+)cqw/)).toBeCloseTo(cqw(DOT_RING), 3)
  })
})

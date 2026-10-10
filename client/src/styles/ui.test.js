import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { contrastRatio } from '../lib/contrast.js'
import { PALETTEN } from '../lib/darstellung.js'

// Box-System Welle 1 (styles/ui.css, components/ui): Ecken und Schatten kommen aus Tokens (tokens.css, palettes.css).
// Wächter: feste border-radius-/box-shadow-Werte außerhalb der Token-Dateien werden gezählt - die Zahl darf nur
// sinken. Wer eine Datei auf Tokens umstellt, senkt BASELINE hier mit.
const stylesDir = dirname(fileURLToPath(import.meta.url))
const TOKEN_FILES = new Set(['palettes.css', 'tokens.css', 'ui.css'])
const NEUTRAL = new Set(['0', 'none', 'inherit', 'initial', 'unset', 'revert'])
// Stand 2026-10-10 (nach Welle 2: Partner-Familie): Werte in den übrigen Stil-Dateien, die nicht nur aus var(--…) und 0 bestehen
// (auch „0 0 0 3px var(--rust-wash)“ zählt - die 3px sind fest).
const BASELINE = { radius: 89, shadow: 68 }

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

// Nur Tokens: nach dem Entfernen von var(--…), inset, Kommas und Nullen bleibt nichts übrig.
const tokenOnly = (value) =>
  value
    .replace(/var\(--[\w-]+\)/g, ' ')
    .replace(/inset/g, ' ')
    .split(/[\s,]+/)
    .every((part) => part === '' || part === '0')

function hardCodedValues(css) {
  const found = { radius: [], shadow: [] }
  for (const [, prop, raw] of stripComments(css).matchAll(/(?:^|[;{\s])((?:border(?:-[a-z]+)*-radius)|box-shadow)\s*:\s*([^;}]+)/g)) {
    const value = raw.replace(/!important/, '').trim()
    if (NEUTRAL.has(value) || tokenOnly(value)) continue
    found[prop === 'box-shadow' ? 'shadow' : 'radius'].push(value)
  }
  return found
}

function countAll() {
  const total = { radius: 0, shadow: 0 }
  for (const file of readdirSync(stylesDir).filter((name) => name.endsWith('.css') && !TOKEN_FILES.has(name))) {
    const found = hardCodedValues(readFileSync(join(stylesDir, file), 'utf8'))
    total.radius += found.radius.length
    total.shadow += found.shadow.length
  }
  return total
}

// --- Ton-Farben der Chips: color-mix(in srgb, …) selbst nachrechnen und WCAG AA prüfen ------------------------
const palettesCss = stripComments(readFileSync(join(stylesDir, 'palettes.css'), 'utf8'))
const blocks = [...palettesCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
  selectors: selectors.split(',').map((selector) => selector.trim()),
  tokens: Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]))
}))
const merge = (match) => Object.assign({}, ...blocks.filter((block) => block.selectors.some(match)).map((block) => block.tokens))

function tokensFor(id, mode) {
  const base = merge((selector) => selector === ':root')
  if (mode === 'hell') return { ...base, ...merge((selector) => selector === `[data-palette='${id}']`) }
  const dark = id === 'familienalbum' ? {} : merge((selector) => selector === `[data-scheme='dunkel'][data-palette='${id}']`)
  return { ...base, ...merge((selector) => selector === ":root[data-scheme='dunkel']"), ...dark }
}

const hexToRgb = (hex) => hex.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16))
const rgbToHex = (rgb) => `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`

function resolve(value, t) {
  const ref = value.match(/^var\((--[\w-]+)\)$/)
  if (ref) return resolve(t[ref[1]], t)
  const mix = value.match(/^color-mix\(in srgb, (var\(--[\w-]+\)) (\d+)%, (var\(--[\w-]+\))\)$/)
  if (!mix) return value
  const share = Number(mix[2]) / 100
  const [a, b] = [resolve(mix[1], t), resolve(mix[3], t)].map(hexToRgb)
  return rgbToHex(a.map((channel, i) => channel * share + b[i] * (1 - share)))
}

const TONES = ['ok', 'wartet', 'gesperrt', 'neu', 'anzeige']

describe('Box-System: Tokens und Wächter', () => {
  test('hardCodedValues erkennt feste Werte und lässt Tokens, 0 und none durch', () => {
    const found = hardCodedValues(
      '.a { border-radius: 50%; box-shadow: 0 1px 2px #000 } .b { border-radius: var(--radius-sm) var(--radius-sm) 0 0; box-shadow: none }' +
        ' .c{border-top-left-radius:4px;border-radius:0} .d { box-shadow: var(--elev-1), inset 0 0 0 3px var(--line) }'
    )
    expect(found).toEqual({ radius: ['50%', '4px'], shadow: ['0 1px 2px #000', 'var(--elev-1), inset 0 0 0 3px var(--line)'] })
  })

  test('feste Ecken und Schatten außerhalb der Token-Dateien werden nicht mehr', () => {
    const now = countAll()
    expect(now.radius, 'feste border-radius').toBeLessThanOrEqual(BASELINE.radius)
    expect(now.shadow, 'feste box-shadow').toBeLessThanOrEqual(BASELINE.shadow)
  })

  test('ui.css nutzt nur Tokens für Ecken und Schatten', () => {
    const found = hardCodedValues(readFileSync(join(stylesDir, 'ui.css'), 'utf8'))
    expect(found).toEqual({ radius: [], shadow: [] })
  })

  test('tokens.css: neue Maße (radius-xs/round, elev-0..2, pad-card-sm..lg)', () => {
    const tokens = readFileSync(join(stylesDir, 'tokens.css'), 'utf8')
    for (const name of ['--radius-xs', '--radius-round', '--elev-0', '--elev-1', '--elev-2', '--pad-card-sm', '--pad-card-md', '--pad-card-lg']) {
      expect(tokens, name).toContain(`${name}:`)
    }
    expect(tokens).toMatch(/--elev-0: var\(--shadow-sm\);\s*--elev-1: var\(--shadow-card\);\s*--elev-2: var\(--shadow-raised\);/)
  })

  for (const { id } of PALETTEN) {
    for (const mode of ['hell', 'dunkel']) {
      test(`${id} ${mode}: Chip-Töne erfüllen WCAG AA (4,5 : 1)`, () => {
        const t = tokensFor(id, mode)
        const failing = TONES.map((tone) => [tone, contrastRatio(resolve(t[`--tone-${tone}-ink`], t), resolve(t[`--tone-${tone}-bg`], t))])
          .filter(([, ratio]) => !(ratio >= 4.5))
          .map(([tone, ratio]) => `${tone}: ${ratio.toFixed(2)}`)
        expect(failing).toEqual([])
      })
    }
  }
})

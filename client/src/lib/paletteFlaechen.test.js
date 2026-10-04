import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { PALETTE_FLAECHEN } from './paletteFlaechen.js'
import { PALETTEN } from './darstellung.js'

// Die Flächen in lib/paletteFlaechen.js sind eine Abschrift aus styles/palettes.css (für die eigene Akzentfarbe) - sie
// müssen genau dort stehen.
const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, '..', 'styles', 'palettes.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
  selectors: selectors.split(',').map((selector) => selector.trim()),
  tokens: Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]))
}))
const tokensOf = (selector) => Object.assign({}, ...blocks.filter((block) => block.selectors.includes(selector)).map((block) => block.tokens))

const MAP = { paper: '--paper', surface: '--surface', sunk: '--surface-sunk', deep: '--paper-deep', hero: '--hero-bg', onRust: '--on-rust' }

describe('lib/paletteFlaechen – Abschrift aus palettes.css', () => {
  for (const { id } of PALETTEN) {
    test(`${id}: hell und dunkel wie im CSS`, () => {
      const light = tokensOf(`[data-palette='${id}']`)
      const dark = tokensOf(`[data-scheme='dunkel'] [data-palette='${id}']`)
      for (const [key, token] of Object.entries(MAP)) {
        expect(PALETTE_FLAECHEN[id].hell[key], `${id} hell ${key}`).toBe(light[token].toLowerCase())
        expect(PALETTE_FLAECHEN[id].dunkel[key], `${id} dunkel ${key}`).toBe(dark[token].toLowerCase())
      }
      expect(PALETTE_FLAECHEN[id].hell.scheme).toBe('hell')
      expect(PALETTE_FLAECHEN[id].dunkel.scheme).toBe('dunkel')
    })
  }
})

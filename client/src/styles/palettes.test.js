import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { contrastRatio } from '../lib/contrast.js'
import { PALETTEN } from '../lib/darstellung.js'

// Die Paletten sind reines CSS (palettes.css) - jsdom rechnet keine Custom Properties aus. Der Test liest die Datei
// selbst, setzt je Farbwelt und Modus die Tokens zusammen (Familienalbum als Grundlage, die Farbwelt darüber) und prüft die
// Kontraste der wichtigsten Paare nach WCAG AA (4,5 : 1 für Text).
const stylesDir = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(stylesDir, 'palettes.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const tokensCss = readFileSync(join(stylesDir, 'tokens.css'), 'utf8')
const globalCss = readFileSync(join(stylesDir, 'global.css'), 'utf8')

const AA = 4.5
const DARK_ROOT = ":root[data-scheme='dunkel']"

const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
  selectors: selectors.split(',').map((selector) => selector.trim()),
  tokens: Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]))
}))

const merge = (predicate) => Object.assign({}, ...blocks.filter((block) => block.selectors.some(predicate)).map((block) => block.tokens))
const lightOf = (id) => merge((selector) => selector === `[data-palette='${id}']`)
const darkOf = (id) => merge((selector) => selector === `[data-scheme='dunkel'][data-palette='${id}']`)

function tokensFor(id, mode) {
  const base = merge((selector) => selector === ':root')
  if (mode === 'hell') return { ...base, ...lightOf(id) }
  return { ...base, ...merge((selector) => selector === DARK_ROOT), ...(id === 'familienalbum' ? {} : darkOf(id)) }
}

// rgba(r, g, b, a) über einer deckenden Farbe -> #rrggbb
function over(rgba, backgroundHex) {
  const [r, g, b, a] = rgba.match(/[\d.]+/g).map(Number)
  const bg = backgroundHex.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16))
  return `#${[r, g, b].map((channel, i) => Math.round(channel * a + bg[i] * (1 - a)).toString(16).padStart(2, '0')).join('')}`
}

function pairs(t) {
  return [
    ['Text auf Papier', t['--text'], t['--paper']],
    ['Text auf Fläche', t['--text'], t['--surface']],
    ['Überschrift auf Papier', t['--ink'], t['--paper']],
    ['Text weich auf Fläche', t['--ink-soft'], t['--surface']],
    ['Leise auf Papier', t['--muted'], t['--paper']],
    ['Leise auf Fläche', t['--muted'], t['--surface']],
    ['Leise auf vertiefter Fläche', t['--muted'], t['--surface-sunk']],
    ['Leise auf tiefem Papier', t['--muted'], t['--paper-deep']],
    ['Schrift auf Rosé', t['--blush-ink'], t['--blush']],
    ['Text auf Rosé', t['--text'], t['--blush']],
    ['Link auf Papier', t['--rust'], t['--paper']],
    ['Link auf Fläche', t['--rust'], t['--surface']],
    ['Knopf', t['--on-rust'], t['--rust']],
    ['Knopf (Hover)', t['--on-rust'], t['--rust-deep']],
    ['Aktiver Reiter', t['--rust'], over(t['--rust-wash'], t['--paper'])],
    ['Hinweis', t['--alpine'], over(t['--alpine-wash'], t['--paper'])],
    ['Zweitfarbe auf Fläche', t['--alpine'], t['--surface']],
    ['Heller Bereich auf dunklem Kopf', t['--hero-text'], t['--hero-bg']],
    ['Leise auf dunklem Kopf', t['--hero-muted'], t['--hero-bg']],
    ['Akzent im Kopf', t['--hero-accent'], t['--hero-bg']]
  ]
}

describe('palettes.css – fünf Farbwelten, hell und dunkel', () => {
  test('ist gleich nach tokens.css eingebunden; hell/dunkel nur über data-scheme, nicht über prefers-color-scheme', () => {
    expect(globalCss).toMatch(/@import '\.\/tokens\.css';\r?\n@import '\.\/palettes\.css';/)
    expect(css).not.toContain('prefers-color-scheme')
    expect(tokensCss).not.toContain('prefers-color-scheme')
    // Die Farben stehen nur noch in palettes.css.
    expect(tokensCss).not.toMatch(/--(paper|rust|ink|surface)\s*:/)
  })

  test('jede Palette aus lib/darstellung.js hat einen hellen und einen dunklen Block mit denselben Tokens', () => {
    for (const { id } of PALETTEN) {
      const light = lightOf(id)
      const dark =
        id === 'familienalbum' ? merge((selector) => selector === `[data-scheme='dunkel'] [data-palette='familienalbum']`) : darkOf(id)
      expect(Object.keys(light).length, id).toBeGreaterThan(10)
      expect(Object.keys(dark).sort(), id).toEqual(Object.keys(light).sort())
      // Auch für die Farbmuster in den Einstellungen (ein Element mit data-palette im dunklen Auftritt).
      expect(blocks.some((block) => block.selectors.includes(`[data-scheme='dunkel'] [data-palette='${id}']`)), id).toBe(true)
    }
  })

  for (const { id } of PALETTEN) {
    for (const mode of ['hell', 'dunkel']) {
      test(`${id} ${mode}: alle wichtigen Paare erfüllen WCAG AA (4,5 : 1)`, () => {
        const t = tokensFor(id, mode)
        const failing = pairs(t)
          .map(([label, fg, bg]) => [label, contrastRatio(fg, bg)])
          .filter(([, ratio]) => !(ratio >= AA))
          .map(([label, ratio]) => `${label}: ${ratio.toFixed(2)}`)
        expect(failing).toEqual([])
      })
    }
  }

  // B+ Familienalbum: die Vorgabe ist der Papierton aus dem Entwurf, die Karten sind weiß, der Akzent Terrakotta.
  test('Familienalbum hell: Papier #fbf5ec, Karte #ffffff, Schrift #2e241d, Terrakotta #a64b2a (Hover #83391e), Salbei, Rosé', () => {
    const t = tokensFor('familienalbum', 'hell')
    expect([t['--paper'], t['--surface'], t['--ink'], t['--muted']]).toEqual(['#fbf5ec', '#ffffff', '#2e241d', '#6b5d52'])
    expect([t['--rust'], t['--rust-deep'], t['--sage'], t['--blush'], t['--line']]).toEqual(['#a64b2a', '#83391e', '#7c8f6a', '#f3d9cc', '#ebdccb'])
  })

  test('Familienalbum dunkel: tiefes Braun statt Schwarz', () => {
    const paper = tokensFor('familienalbum', 'dunkel')['--paper']
    const [r, g, b] = paper.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16))
    expect(r).toBeGreaterThan(b)
    expect(r + g + b).toBeGreaterThan(40)
  })

  test('Hintergrund „Weiß“ macht nur im hellen Modus das Papier weiß - Leise Schrift bleibt dort lesbar', () => {
    const weiss = blocks.find((block) => block.selectors.includes(":root[data-grund='weiss'][data-scheme='hell']"))
    expect(weiss.tokens['--paper']).toBe('#ffffff')
    for (const { id } of PALETTEN) {
      const t = { ...tokensFor(id, 'hell'), ...weiss.tokens }
      expect(contrastRatio(t['--muted'], t['--paper-deep']), id).toBeGreaterThanOrEqual(AA)
      expect(contrastRatio(t['--rust'], t['--paper']), id).toBeGreaterThanOrEqual(AA)
    }
  })

  test('eigene Akzentfarbe: je Modus aus --akzent-* (lib/akzent.js), nur über data-akzent', () => {
    for (const scheme of ['hell', 'dunkel']) {
      const block = blocks.find((entry) => entry.selectors.includes(`:root[data-akzent][data-scheme='${scheme}']`))
      expect(block.tokens['--rust']).toBe(`var(--akzent-${scheme})`)
      expect(block.tokens['--on-rust']).toBe(`var(--akzent-${scheme}-auf)`)
    }
  })
})

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

// Audit: die versteckten Radio-Knöpfe der Farbfelder und Vorlagen maßen 13 × 13 px. jsdom rechnet kein Layout -
// darum prüft der Test die Regeln: die Radio-Box deckt die ganze Wahl ab, ein Farbfeld ist mindestens 44 px groß.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'visitenkarten.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// Die Deklarationen der Regel, deren Selektor genau `selector` ist.
function block(selector) {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (match[1].split(',').map((part) => part.trim()).includes(selector)) return match[2]
  }
  return ''
}

describe('Visitenkarten: Tippflächen', () => {
  test.each(['.vk-swatch input', '.vk-vorlage input'])('%s deckt die ganze Wahl ab', (selector) => {
    const rules = block(selector)
    expect(rules).toMatch(/inset:\s*0/)
    expect(rules).toMatch(/width:\s*100%/)
    expect(rules).toMatch(/height:\s*100%/)
  })

  test('.vk-swatch ist mindestens 44 px breit und hoch', () => {
    const rules = block('.vk-swatch')
    expect(rules).toMatch(/min-width:\s*max\([^)]*44px\)/)
    expect(rules).toMatch(/min-height:\s*44px/)
  })
})

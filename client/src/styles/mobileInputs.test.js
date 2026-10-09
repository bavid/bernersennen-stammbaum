import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

// Zoom am Handy (Pinch-Zoom bleibt erlaubt, kein maximum-scale): iOS Safari zoomt beim Fokus in ein Feld mit weniger
// als 16 px Schrift hinein - und oft nicht wieder heraus. Die Grundschrift ist 15 px (base.css --root-size), Felder erben
// sie oder bekommen var(--text-sm). Darum liegt in base.css ein Sicherheitsnetz: am Handy (≤ 820 px) hat jedes Feld
// mindestens 16 px, mit !important über allen Komponenten-Stilen. Dieser Test hält das Netz dicht - und prüft, dass
// keine 100vw-Breite mehr ein Layout-Kästchen misst (100vw ist am Handy mit Scrollleiste breiter als die Seite).
const dir = dirname(fileURLToPath(import.meta.url))
const ROOT_FONT_PX = 15
const MIN_FIELD_PX = 16
const TOKENS_PX = { '--text-xs': 0.8 * ROOT_FONT_PX, '--text-sm': 0.875 * ROOT_FONT_PX, '--text-base': ROOT_FONT_PX }
const sheets = readdirSync(dir)
  .filter((name) => name.endsWith('.css'))
  .map((name) => ({ name, css: readFileSync(join(dir, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }))

function rules() {
  return sheets.flatMap(({ name, css }) =>
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
      file: name,
      selectors: match[1].split(',').map((part) => part.trim()),
      body: match[2]
    }))
  )
}

function fontSizePx(body) {
  const match = body.match(/(?:^|;)\s*font-size\s*:\s*([^;]+)/)
  if (!match) return null
  const value = match[1].trim()
  const token = value.match(/^var\((--text-[a-z]+)\)$/)
  if (token) return TOKENS_PX[token[1]] ?? null
  const unit = value.match(/^(\d*\.?\d+)(rem|px)$/)
  if (!unit) return null
  return unit[2] === 'rem' ? Number(unit[1]) * ROOT_FONT_PX : Number(unit[1])
}

const FIELD = /(^|[\s>+~(])(input|textarea|select)\b(?!\[type=['"]?(checkbox|radio|range|color))/
const isField = (selector) => FIELD.test(selector)

describe('Formularfelder am Handy mindestens 16 px (kein Auto-Zoom in iOS Safari)', () => {
  test('base.css hat das Sicherheitsnetz: @media (max-width: 820px) … font-size: max(16px, 1rem) !important für input, textarea, select und contenteditable', () => {
    const base = sheets.find((sheet) => sheet.name === 'base.css').css
    const blocks = [...base.matchAll(/@media \(max-width: 820px\)\s*\{([\s\S]*?)\}\s*\}/g)].map((m) => m[1])
    const block = blocks.find((content) => content.includes('max(16px'))
    expect(block, 'Media-Block mit max(16px …) fehlt').toBeTruthy()
    // der Treffer endet vor der schließenden Klammer der Regel - sie kommt für das Zerlegen wieder dazu
    const rule = `${block}}`.match(/([^{}]+)\{([^{}]*)\}/)
    for (const name of ['input', 'textarea', 'select', '[contenteditable']) expect(rule[1]).toContain(name)
    expect(rule[2]).toMatch(/font-size\s*:\s*max\(16px,\s*1rem\)\s*!important/)
  })

  test('kein Komponenten-Stil unterläuft das Netz mit !important und weniger als 16 px', () => {
    const offenders = rules()
      .filter((rule) => rule.selectors.some(isField))
      .filter((rule) => /font-size[^;]*!important/.test(rule.body))
      .filter((rule) => {
        const px = fontSizePx(rule.body.replace(/!important/g, ''))
        return px !== null && px < MIN_FIELD_PX && rule.file !== 'base.css'
      })
      .map((rule) => `${rule.file}: ${rule.selectors.join(', ')}`)
    expect(offenders).toEqual([])
  })

  test('zur Kenntnis: Felder mit kleiner Schrift (ohne !important) werden vom Netz abgedeckt', () => {
    const small = rules()
      .filter((rule) => rule.selectors.some(isField) && !/!important/.test(rule.body))
      .map((rule) => ({ rule, px: fontSizePx(rule.body) }))
      .filter(({ px }) => px !== null && px < MIN_FIELD_PX)
    // Es gibt sie (deshalb das Netz) - und sie dürfen bleiben, weil base.css am Handy darüberliegt.
    expect(small.every(({ rule }) => rule.file !== 'base.css' || !/max-width: 820px/.test(rule.body))).toBe(true)
  })
})

describe('Breiten am Handy: keine 100vw-Kästchen', () => {
  test('100vw nur noch mit abgezogener Scrollleiste (var(--sbw)) - Dialoge, Blätter, Toast und Bilderrahmen messen in %', () => {
    const offenders = sheets.flatMap(({ name, css }) =>
      [...css.matchAll(/[^;{}]*100vw[^;{}]*/g)].map((m) => m[0].trim()).filter((decl) => !/100vw\s*-\s*var\(--sbw/.test(decl)).map((decl) => `${name}: ${decl}`)
    )
    expect(offenders).toEqual([])
  })

  test('html und body schneiden waagerechten Überlauf ab (overflow-x: clip, nicht hidden) und Bedienelemente haben touch-action: manipulation', () => {
    const base = sheets.find((sheet) => sheet.name === 'base.css').css
    expect(base).toMatch(/html,\s*body\s*\{[^}]*overflow-x:\s*clip/)
    expect(base).not.toMatch(/overflow-x:\s*hidden/)
    const touch = rules().find((rule) => rule.file === 'base.css' && /touch-action\s*:\s*manipulation/.test(rule.body))
    expect(touch).toBeTruthy()
    for (const name of ['a', 'button', 'input', 'select', 'textarea']) expect(touch.selectors).toContain(name)
  })
})

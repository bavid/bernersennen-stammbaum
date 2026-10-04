import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

// Trefferflächen (WCAG 2.5.5, „Susi“ tippt mit dem Daumen): jeder Symbol-Knopf (.icon-btn, auch „Schließen“ im Modal) und
// jeder Knopf eines Umschalters (.segmented, samt „Bearbeiten | Kundensicht“) ist mindestens 44 × 44 px groß. jsdom rechnet
// kein Layout - darum prüft der Test die Regeln aller Stylesheets.
const MIN_TARGET_PX = 44
const ROOT_FONT_PX = 16
const dir = dirname(fileURLToPath(import.meta.url))
const sheets = readdirSync(dir)
  .filter((name) => name.endsWith('.css'))
  .map((name) => ({ name, css: readFileSync(join(dir, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }))

// Alle Regeln als { file, selectors, body } - auch die innerhalb von @media.
function rules() {
  return sheets.flatMap(({ name, css }) =>
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
      file: name,
      selectors: match[1].split(',').map((part) => part.trim()),
      body: match[2]
    }))
  )
}

// "2.75rem" -> 44, "44px" -> 44; alles andere (var(), calc(), auto) -> null.
function toPx(value) {
  const match = value.trim().match(/^(\d*\.?\d+)(rem|px)$/)
  if (!match) return null
  return match[2] === 'rem' ? Number(match[1]) * ROOT_FONT_PX : Number(match[1])
}

function declarations(body, properties) {
  return [...body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)/g)]
    .filter((match) => properties.includes(match[1]))
    .map((match) => ({ property: match[1], px: toPx(match[2]) }))
}

const SIZE_PROPERTIES = ['width', 'height', 'min-width', 'min-height']
const TARGETS = [/\.icon-btn\b(?![-\w])(?!\s*(svg|img))/, /segmented(-sm)?\s+button\b/, /\.view-mode-switch\s+a\b/]
const isTarget = (selector) => TARGETS.some((pattern) => pattern.test(selector) && !/\s(svg|img|span)\b\s*$/.test(selector))

describe('Trefferflächen mindestens 44 px', () => {
  test('.icon-btn ist 44 × 44 px groß, .segmented button mindestens 44 × 44 px', () => {
    const iconBtn = rules().filter((rule) => rule.file === 'components.css' && rule.selectors.includes('.icon-btn'))
    expect(iconBtn.length).toBeGreaterThan(0)
    const iconSizes = declarations(iconBtn[0].body, ['width', 'height'])
    expect(iconSizes).toEqual([
      { property: 'width', px: MIN_TARGET_PX },
      { property: 'height', px: MIN_TARGET_PX }
    ])

    const segmented = rules().find((rule) => rule.file === 'components.css' && rule.selectors.includes('.segmented button'))
    expect(declarations(segmented.body, ['min-width', 'min-height'])).toEqual([
      { property: 'min-height', px: MIN_TARGET_PX },
      { property: 'min-width', px: MIN_TARGET_PX }
    ])
  })

  test('keine Regel macht einen Symbol- oder Umschalter-Knopf kleiner', () => {
    const shrinking = rules()
      .filter((rule) => rule.selectors.some(isTarget))
      .flatMap((rule) =>
        declarations(rule.body, SIZE_PROPERTIES)
          .filter((size) => size.px !== null && size.px < MIN_TARGET_PX)
          .map((size) => `${rule.file}: ${rule.selectors.join(', ')} { ${size.property}: ${size.px}px }`)
      )
    expect(shrinking).toEqual([])
  })
})

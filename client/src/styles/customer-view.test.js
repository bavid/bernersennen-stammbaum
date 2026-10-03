import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

// Der Rahmen der Kundensicht (PreviewFrame) ist reines CSS - jsdom rechnet kein Layout. Darum prüft der Test die Regeln:
// kein fester Rahmen mit eigenem Scrollbereich mehr (vorher 505 px hoch bei gut 5000 px Inhalt), am Handy kein Rahmen.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'customer-view.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// Die Deklarationen aller Regeln, deren Selektor genau `selector` ist (ohne Kombinationen wie ".a .b").
function blocks(source, selector) {
  const result = []
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(',').map((part) => part.trim())
    if (selectors.includes(selector)) result.push(match[2])
  }
  return result
}

function split() {
  const start = css.indexOf('@media (max-width: 720px)')
  expect(start).toBeGreaterThan(-1)
  return { desktop: css.slice(0, start), mobile: css.slice(start) }
}

describe('customer-view.css – Rahmen der Kundensicht', () => {
  test('der Rahmen hat keine feste Höhe und der Inhalt kein eigenes Scrollfenster', () => {
    const { desktop } = split()
    const device = blocks(desktop, '.preview-frame-device')
    const screen = blocks(desktop, '.preview-frame-screen')
    expect(device.length).toBeGreaterThan(0)
    expect(screen.length).toBeGreaterThan(0)
    for (const block of device) expect(block).not.toMatch(/(^|[\s;])(max-)?height\s*:/)
    for (const block of screen) expect(block).not.toMatch(/overflow(-y)?\s*:\s*(auto|scroll)/)
    // clip statt hidden: kein Scrollcontainer, die untere Leiste kann am Fensterrand kleben.
    expect(device[0]).toMatch(/overflow:\s*clip/)
    expect(blocks(desktop, '.preview-frame-nav')[0]).toMatch(/position:\s*sticky;[\s\S]*bottom:\s*0/)
  })

  test('am Handy kein Rahmen-im-Rahmen: ohne Rand und ohne die zweite untere Leiste', () => {
    const { mobile } = split()
    expect(blocks(mobile, '.preview-frame-device')[0]).toMatch(/border:\s*0;[\s\S]*box-shadow:\s*none;/)
    expect(blocks(mobile, '.preview-frame-nav')[0]).toMatch(/display:\s*none;/)
    for (const block of blocks(mobile, '.preview-frame-device')) expect(block).not.toMatch(/(^|[\s;])height\s*:/)
  })
})

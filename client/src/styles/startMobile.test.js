import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

// Start am Handy: die Seitenspalte („Meine Familien“, „Bilderrahmen“) doppelt die untere Leiste und das Menü
// und wird darum unter 720 px ausgeblendet. jsdom rechnet kein Layout - der Test prüft die Regel.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'structure.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

test('blendet die Start-Seitenspalte am Handy aus', () => {
  const mobileBlocks = [...css.matchAll(/@media \(max-width: 720px\)\s*\{([\s\S]*?)\r?\n\}/g)].map((match) => match[1])
  expect(mobileBlocks.some((block) => /\.start-side\s*\{\s*display:\s*none;\s*\}/.test(block))).toBe(true)
})

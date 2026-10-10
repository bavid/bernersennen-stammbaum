import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

// jsdom rechnet kein Layout - darum prüft der Test die Regeln selbst (Audit: /nachrichten zeigte unter dem Reiter
// „Wir waren hier“ weiter die Nachrichtenliste, weil `.inbox { display: grid }` das hidden-Attribut aushebelte).
const dir = dirname(fileURLToPath(import.meta.url))
const read = (file) => readFileSync(join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('hidden-Attribut', () => {
  test('base.css: [hidden] blendet immer aus, gegen jede display-Regel einer Klasse', () => {
    expect(read('base.css')).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/)
  })

  test('partner-inbox.css: das Panel .inbox setzt display nur, solange es nicht verborgen ist', () => {
    const css = read('partner-inbox.css')
    expect(css).toMatch(/\.inbox:not\(\[hidden\]\)\s*\{[^}]*display:\s*grid/)
    expect(css).not.toMatch(/(^|\})\s*\.inbox\s*\{/)
  })
})

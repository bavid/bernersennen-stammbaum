import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { VK_PRINT_BODY_CLASS } from '../components/visitenkarte/VisitenkartenBogen.jsx'

// Die Druckregeln der Visitenkarten (Phase V5) sind reines CSS - jsdom wertet @media print nicht aus. Deshalb prüft der
// Test die Datei selbst: eingebunden nach print.css, beim Drucken nur die Druckfassung in <body>, A4 über die benannte
// Seite aus print.css (kein zweites namenloses @page neben dem der Collage), ein Bogen je Blatt in echten Millimetern.
const stylesDir = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(stylesDir, 'visitenkarten.css'), 'utf8')
const cardCss = readFileSync(join(stylesDir, 'visitenkarte-karte.css'), 'utf8')
const globalCss = readFileSync(join(stylesDir, 'global.css'), 'utf8')
const printBlock = css.slice(css.indexOf('@media print'))

describe('visitenkarten.css', () => {
  test('ist samt Karten-Datei nach print.css in global.css eingebunden', () => {
    const imports = [...globalCss.matchAll(/@import '\.\/([^']+)';/g)].map((match) => match[1])
    for (const file of ['visitenkarten.css', 'visitenkarte-karte.css']) {
      expect(imports).toContain(file)
      expect(imports.indexOf(file)).toBeGreaterThan(imports.indexOf('print.css'))
    }
  })

  test('beim Drucken nur die Druckfassung: App (#root) aus, .vk-print an - am Bildschirm umgekehrt', () => {
    expect(css).toMatch(/\.vk-print\s*\{\s*display:\s*none;/)
    expect(printBlock).toMatch(new RegExp(`body\\.${VK_PRINT_BODY_CLASS} > #root\\s*\\{\\s*display:\\s*none !important;`))
    expect(printBlock).toMatch(new RegExp(`body\\.${VK_PRINT_BODY_CLASS} > \\.vk-print\\s*\\{\\s*display:\\s*block;`))
  })

  test('A4 über die benannte Seite "voucher", 1 mm je Einheit, ein Bogen je Blatt, Farben exakt', () => {
    expect(css).not.toMatch(/@page\s*\{/)
    expect(cardCss).not.toMatch(/@page|@media print/)
    expect(printBlock).toMatch(/\.vk-print \.vk-sheet\s*\{[^}]*--vk-mm:\s*1mm;[^}]*page:\s*voucher;[^}]*height:\s*296mm;[^}]*break-after:\s*page;/)
    expect(printBlock).toMatch(/print-color-adjust:\s*exact;/)
    expect(cardCss).toMatch(/\.vk-card\s*\{[^}]*width:\s*calc\(85 \* var\(--u\)\);[^}]*height:\s*calc\(55 \* var\(--u\)\);/)
    expect(cardCss).toMatch(/\.vk-sheet\s*\{[^}]*width:\s*calc\(210 \* var\(--u\)\);[^}]*height:\s*calc\(297 \* var\(--u\)\);/)
  })
})

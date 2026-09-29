import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

// Die Druckregeln sind reines CSS - jsdom wertet @media print nicht aus. Deshalb prüft der Test die Datei
// selbst: Sie existiert, ist eingebunden und blendet im Druck die App-Oberfläche aus (die Klassennamen
// stammen aus App.jsx AppHeader, AdminPage.jsx Dashboard, EnvBanner.jsx und DemoBanner.jsx).
const stylesDir = dirname(fileURLToPath(import.meta.url))
const printCss = readFileSync(join(stylesDir, 'print.css'), 'utf8')
const globalCss = readFileSync(join(stylesDir, 'global.css'), 'utf8')

function printBlock() {
  const start = printCss.indexOf('@media print')
  expect(start).toBeGreaterThan(-1)
  return printCss.slice(start)
}

function hiddenSelectors(block) {
  // Alle Selektoren vor einem Block, der display: none enthält (Kommentare vorher entfernt)
  const withoutComments = block.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...withoutComments.matchAll(/([^{}]+)\{[^{}]*display:\s*none\s*!important[^{}]*\}/g)].flatMap((match) =>
    match[1].split(',').map((selector) => selector.trim())
  )
}

describe('print.css', () => {
  test('ist in global.css eingebunden', () => {
    expect(globalCss).toContain("@import './print.css';")
  })

  test('druckt auf A4 mit 10 mm Rand (benannte Seite, Rand als Innenabstand) und trennt Bögen ohne Karten zu zerschneiden', () => {
    const block = printBlock()
    // Kein zweites namenloses @page: collage.css druckt darüber randlos, beide Regeln würden sich sonst schlagen.
    expect(block).not.toMatch(/@page\s*\{/)
    expect(block).toMatch(/@page voucher\s*\{[^}]*size:\s*A4;[^}]*margin:\s*0;/)
    expect(block).toMatch(/\.voucher-sheet\s*\{[^}]*page:\s*voucher;[^}]*width:\s*210mm;[^}]*padding:\s*10mm;[^}]*break-after:\s*page;/)
    expect(printCss).toMatch(/\.voucher-card\s*\{[^}]*break-inside:\s*avoid;/)
  })

  test('zeigt im Druck die App wieder, die collage.css für ihren eigenen Druck ausblendet', () => {
    expect(printBlock()).toMatch(/body\.has-voucher-print > #root\s*\{[^}]*display:\s*block\s*!important;/)
  })

  test('blendet im Druck Kopf, Navigation, Bänder und die Werkzeugleiste aus', () => {
    const hidden = hiddenSelectors(printBlock())
    for (const selector of ['.app-header', '.app-nav', '.admin-header', '.env-banner', '.demo-banner', '.print-toolbar']) {
      expect(hidden).toContain(selector)
    }
  })

  test('Karten haben Scheckkarten-Maß und der Bogen zwei Spalten', () => {
    expect(printCss).toMatch(/\.voucher-card\s*\{[^}]*width:\s*85mm;[^}]*height:\s*55mm;/)
    expect(printCss).toMatch(/\.voucher-sheet-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*85mm\);[^}]*grid-auto-rows:\s*55mm;/)
    // Die Rückseite spiegelt die Spaltenreihenfolge für den beidseitigen Druck.
    expect(printCss).toMatch(/\.voucher-sheet-back \.voucher-sheet-grid\s*\{[^}]*direction:\s*rtl;/)
  })

  test('Kartenfarben sind druckfest: Schwarz auf Weiß, unabhängig vom Dunkelmodus', () => {
    expect(printCss).toMatch(/\.voucher-card\s*\{[^}]*background:\s*#fff;/)
    expect(printCss).toMatch(/--card-ink:\s*#1c1511;/)
    expect(printCss).toMatch(/\.voucher-qr\s*\{[^}]*background:\s*#fff;/)
  })
})

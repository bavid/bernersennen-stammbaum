import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

// Web App Manifest (public/manifest.webmanifest) und die Symbole: gültiges JSON mit allem, was ein Browser zum
// Installieren braucht (Name, start_url, display, Symbole 192 und 512 px, eins maskable). Die PNGs liegen fest im Repo
// (einmal aus dem Pfoten-Logo favicon.svg gerendert) - zusammen klein.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const publicDir = join(root, 'public')
const MAX_ICON_BYTES_TOTAL = 100 * 1024

function pngSize(file) {
  const buffer = readFileSync(file)
  expect(buffer.subarray(1, 4).toString()).toBe('PNG')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

describe('manifest.webmanifest', () => {
  const manifest = JSON.parse(readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8'))

  test('Pflichtfelder: Name, Kurzname, Start, Bereich, standalone, Farben, Sprache', () => {
    expect(manifest.name).toBe('Familie auf Pfoten')
    expect(manifest.short_name).toBe('Pfoten')
    expect(manifest.start_url).toBe('/start')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.lang).toBe('de')
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/)
    expect(manifest.theme_color).toBe('#fbf5ec')
    expect(Array.isArray(manifest.categories) && manifest.categories.length > 0).toBe(true)
  })

  test('Symbole 192 und 512 px als PNG, dazu eines für maskierte Formen - alle Dateien da und zusammen klein', () => {
    const sizes = manifest.icons.map((icon) => icon.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512')).toBe(true)
    let total = 0
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png')
      const file = join(publicDir, icon.src)
      const [width, height] = icon.sizes.split('x').map(Number)
      expect(pngSize(file)).toEqual({ width, height })
      total += statSync(file).size
    }
    total += statSync(join(publicDir, 'icons', 'apple-touch-icon.png')).size
    expect(pngSize(join(publicDir, 'icons', 'apple-touch-icon.png'))).toEqual({ width: 180, height: 180 })
    expect(total).toBeLessThan(MAX_ICON_BYTES_TOTAL)
  })

  test('index.html verweist auf Manifest, Apple-Symbol und App-Titel', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8')
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/)
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/)
    expect(html).toMatch(/<meta name="apple-mobile-web-app-title" content="Pfoten"/)
    expect(html).toMatch(/<meta name="theme-color" content="#fbf5ec"/)
  })

  test('die Offline-Seite kommt ohne eingebettetes Skript aus (Content-Security-Policy)', () => {
    const html = readFileSync(join(publicDir, 'offline.html'), 'utf8')
    expect(html).not.toMatch(/<script/)
    expect(html).toMatch(/Gerade offline/)
    expect(html).toMatch(/sicher auf dem Server/)
  })
})

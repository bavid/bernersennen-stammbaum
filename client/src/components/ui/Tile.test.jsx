// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import Tile from './Tile.jsx'
import { render } from './renderForTest.js'

describe('Tile', () => {
  test('Bild mit Unterschrift als figure/figcaption, Bild lädt verzögert', () => {
    const tile = render(<Tile src="/a.jpg" alt="" title="Benno" sub="3 Jahre" />)
    expect(tile.className).toBe('ui-tile ui-tile--square')
    const img = tile.querySelector('figure img')
    expect(img.getAttribute('alt')).toBe('')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(tile.querySelector('figcaption').textContent).toBe('Benno3 Jahre')
  })

  test('ohne Bild: erster Buchstabe, für Screenreader verborgen', () => {
    const tile = render(<Tile title="luna" shape="wide" />)
    expect(tile.classList.contains('ui-tile--wide')).toBe(true)
    const initial = tile.querySelector('.ui-tile-media span')
    expect(initial.textContent).toBe('L')
    expect(initial.getAttribute('aria-hidden')).toBe('true')
    expect(tile.querySelector('img')).toBeNull()
  })

  test('mit href ist die ganze Kachel ein Link', () => {
    const tile = render(<Tile href="/tier/1" title="Benno" />)
    expect(tile.tagName).toBe('A')
    expect(tile.getAttribute('href')).toBe('/tier/1')
    expect(tile.textContent).toContain('Benno')
  })
})

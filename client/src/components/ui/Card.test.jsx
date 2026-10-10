// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import Card from './Card.jsx'
import { render } from './renderForTest.js'

describe('Card', () => {
  test('Vorgabe: div, Album-Karte, mittlerer Innenabstand', () => {
    const card = render(<Card>Inhalt</Card>)
    expect(card.tagName).toBe('DIV')
    expect(card.className).toBe('ui-card ui-card--raised ui-card--pad-md')
    expect(card.textContent).toBe('Inhalt')
  })

  test('Variante, Abstand, Element und eigene Klasse kommen als Klassen an', () => {
    const card = render(
      <Card as="section" variant="tinted" pad="lg" className="extra" aria-labelledby="titel">
        x
      </Card>
    )
    expect(card.tagName).toBe('SECTION')
    expect([...card.classList]).toEqual(['ui-card', 'ui-card--tinted', 'ui-card--pad-lg', 'extra'])
    expect(card.getAttribute('aria-labelledby')).toBe('titel')
  })

  test('unbekannte Werte fallen auf die Vorgabe zurück (kein beliebiges Element)', () => {
    const card = render(
      <Card as="script" variant="bunt" pad="xl">
        x
      </Card>
    )
    expect(card.tagName).toBe('DIV')
    expect(card.className).toBe('ui-card ui-card--raised ui-card--pad-md')
  })

  test('als Listeneintrag und als interaktive Karte', () => {
    const list = render(
      <ul>
        <Card as="li" variant="interactive" pad="sm">
          <a href="/x">Weiter</a>
        </Card>
      </ul>
    )
    const item = list.querySelector('li')
    expect(item.className).toBe('ui-card ui-card--interactive ui-card--pad-sm')
    expect(item.querySelector('a').getAttribute('href')).toBe('/x')
  })
})

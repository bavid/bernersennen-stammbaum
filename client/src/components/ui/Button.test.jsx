// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import Button from './Button.jsx'
import { render } from './renderForTest.js'

function Custom({ className, children }) {
  return (
    <a className={className} data-own="1">
      {children}
    </a>
  )
}

describe('Button', () => {
  test('Vorgabe: echter Knopf mit type="button" und .btn .btn-primary', () => {
    const button = render(<Button>Speichern</Button>)
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.className).toBe('btn btn-primary')
  })

  test('Variante und Größe nutzen die vorhandenen Klassen', () => {
    expect(render(<Button variant="ghost" size="sm">a</Button>).className).toBe('btn btn-ghost btn-compact')
    expect(render(<Button variant="ink" size="lg" block>a</Button>).className).toBe('btn btn-ink btn-lg btn-block')
    expect(render(<Button variant="danger" type="submit">a</Button>).getAttribute('type')).toBe('submit')
    expect(render(<Button variant="neon">a</Button>).className).toBe('btn btn-primary')
  })

  test('mit href ein Link, mit as eine eigene Komponente', () => {
    const link = render(<Button href="/hilfe">Hilfe</Button>)
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('type')).toBeNull()
    const custom = render(<Button as={Custom} variant="ghost">x</Button>)
    expect(custom.dataset.own).toBe('1')
    expect(custom.className).toBe('btn btn-ghost')
  })

  test('disabled kommt am Knopf an', () => {
    expect(render(<Button disabled>a</Button>).disabled).toBe(true)
  })
})

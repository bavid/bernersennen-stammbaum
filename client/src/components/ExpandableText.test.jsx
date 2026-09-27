// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'
import ExpandableText from './ExpandableText.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom rechnet kein Layout: Höhe des Textes simulieren (hoch = länger als die sichtbaren Zeilen)
function fakeHeights(scrollHeight, clientHeight) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollHeight })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => clientHeight })
}

let container
function render(element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(element))
  return root
}

afterEach(() => {
  container?.remove()
  delete HTMLElement.prototype.scrollHeight
  delete HTMLElement.prototype.clientHeight
})

test('a long text is clamped and can be expanded and collapsed again', () => {
  fakeHeights(900, 120)
  render(<ExpandableText text={'Sehr langer Text '.repeat(200)} className="dog-hero-description" lines={4} />)
  const text = container.querySelector('.dog-hero-description')
  const toggle = container.querySelector('button')
  expect(text.classList.contains('is-clamped')).toBe(true)
  expect(toggle.textContent).toContain('Mehr lesen')
  expect(toggle.getAttribute('aria-expanded')).toBe('false')

  act(() => toggle.click())
  expect(text.classList.contains('is-clamped')).toBe(false)
  expect(toggle.textContent).toContain('Weniger')
  expect(toggle.getAttribute('aria-expanded')).toBe('true')

  act(() => toggle.click())
  expect(text.classList.contains('is-clamped')).toBe(true)
})

test('a short text shows no button', () => {
  fakeHeights(60, 60)
  render(<ExpandableText text="Kurz und knapp." className="entry-text" lines={6} />)
  expect(container.querySelector('button')).toBeNull()
  expect(container.querySelector('.entry-text').textContent).toBe('Kurz und knapp.')
})

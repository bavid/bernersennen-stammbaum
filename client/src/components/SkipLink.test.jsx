// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import SkipLink from './SkipLink.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  document.body.innerHTML = ''
})

async function render(extra) {
  document.body.innerHTML = extra
  container = document.createElement('div')
  document.body.prepend(container)
  root = createRoot(container)
  await act(async () => root.render(<SkipLink />))
  return container.querySelector('button')
}

test('"Zum Inhalt springen" setzt den Fokus auf <main> (fokussierbar, aber nicht in der Tab-Reihenfolge)', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const button = await render('<header><a href="/">Kopf</a></header><main><h1>Wegbegleiter</h1></main>')
  expect(button.textContent).toBe('Zum Inhalt springen')
  act(() => button.click())
  const main = document.querySelector('main')
  expect(document.activeElement).toBe(main)
  expect(main.getAttribute('tabindex')).toBe('-1')
})

test('ohne <main> (Login, öffentliche Seiten) landet der Fokus auf der Seitenüberschrift', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const button = await render('<section><h1>Anmelden</h1></section>')
  act(() => button.click())
  expect(document.activeElement).toBe(document.querySelector('h1'))
})

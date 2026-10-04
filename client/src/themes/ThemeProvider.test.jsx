// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeProvider.jsx'
import { THEME } from './index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

afterEach(() => {
  if (container) {
    act(() => container.remove())
    container = null
  }
})

async function render(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () => createRoot(container).render(ui))
}

let captured = null
function Reader() {
  captured = useTheme()
  return <span>{captured.words === captured.theme.words ? 'same' : 'different'}</span>
}

// B+ Familienalbum: ein Auftritt für alle - die Hülle zeigt nur ihre Kinder, useTheme liefert immer den Standard.
test('useTheme gives the one theme and its words, with and without the provider', async () => {
  await render(
    <ThemeProvider>
      <Reader />
    </ThemeProvider>
  )
  expect(captured.theme).toBe(THEME)
  expect(container.querySelector('span').textContent).toBe('same')
  act(() => container.remove())
  container = null

  await render(<Reader />)
  expect(captured.theme).toBe(THEME)
  expect(captured.words).toBe(THEME.words)
  expect(document.documentElement.dataset.theme).toBeUndefined()
})

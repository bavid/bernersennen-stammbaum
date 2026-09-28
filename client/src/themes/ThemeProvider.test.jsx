// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeProvider.jsx'
import { getTheme } from './index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let icon

beforeEach(() => {
  icon = document.createElement('link')
  icon.setAttribute('rel', 'icon')
  icon.setAttribute('href', '/favicon.svg')
  document.head.appendChild(icon)
})

afterEach(() => {
  if (container) {
    act(() => container.remove())
    container = null
  }
  icon?.remove()
  delete document.documentElement.dataset.theme
  document.title = ''
})

async function render(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => root.render(ui))
  return root
}

test('sets data-theme, document title and favicon from themeId', async () => {
  await render(<ThemeProvider themeId="berner">child</ThemeProvider>)
  expect(document.documentElement.dataset.theme).toBe('berner')
  expect(document.title).toBe('Familienchronik')
  expect(document.querySelector('link[rel="icon"]').getAttribute('href')).toBe('/favicon-berner.svg')
})

function PreviewSwitcher({ toId }) {
  const { setPreviewId } = useTheme()
  return (
    <button type="button" onClick={() => setPreviewId(toId)}>
      preview
    </button>
  )
}

test('setPreviewId shows a different theme without saving it, and changing themeId clears the preview', async () => {
  await render(
    <ThemeProvider themeId="berner">
      <PreviewSwitcher toId="standard" />
    </ThemeProvider>
  )
  expect(document.documentElement.dataset.theme).toBe('berner')

  const button = container.querySelector('button')
  await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  expect(document.documentElement.dataset.theme).toBe('standard')

  const root = createRoot(container)
  await act(async () =>
    root.render(
      <ThemeProvider themeId="standard">
        <PreviewSwitcher toId="standard" />
      </ThemeProvider>
    )
  )
  await act(async () =>
    root.render(
      <ThemeProvider themeId="berner">
        <PreviewSwitcher toId="standard" />
      </ThemeProvider>
    )
  )
  expect(document.documentElement.dataset.theme).toBe('berner')
})

let captured = null
function NoProviderReader() {
  captured = useTheme()
  return null
}

test('useTheme outside a provider returns the standard theme and a no-op setPreviewId', async () => {
  await render(<NoProviderReader />)
  expect(captured.theme).toEqual(getTheme('standard'))
  expect(captured.words).toEqual(getTheme('standard').words)
  expect(() => captured.setPreviewId('berner')).not.toThrow()
})

function WordsReader() {
  const { theme, words } = useTheme()
  return <span data-testid="words">{words === theme.words ? 'same' : 'different'}</span>
}

test('words from the context equals theme.words', async () => {
  await render(
    <ThemeProvider themeId="berner">
      <WordsReader />
    </ThemeProvider>
  )
  expect(container.querySelector('span').textContent).toBe('same')
})

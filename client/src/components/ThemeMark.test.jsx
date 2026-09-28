// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import ThemeMark from './ThemeMark.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

afterEach(() => {
  if (container) {
    act(() => container.remove())
    container = null
  }
  delete document.documentElement.dataset.theme
  document.title = ''
})

async function render(ui) {
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () => createRoot(container).render(ui))
  return container
}

test('renders the paw mark inside the standard theme', async () => {
  await render(
    <ThemeProvider themeId="standard">
      <ThemeMark />
    </ThemeProvider>
  )
  const svg = container.querySelector('svg')
  expect(svg.getAttribute('data-mark')).toBe('paw')
})

test('renders the berner mark inside the berner theme', async () => {
  await render(
    <ThemeProvider themeId="berner">
      <ThemeMark />
    </ThemeProvider>
  )
  const svg = container.querySelector('svg')
  expect(svg.getAttribute('data-mark')).toBe('berner')
})

test('renders the paw mark outside any provider', async () => {
  await render(<ThemeMark />)
  const svg = container.querySelector('svg')
  expect(svg.getAttribute('data-mark')).toBe('paw')
})

test('with a title, the svg is an accessible image with a title element', async () => {
  await render(
    <ThemeProvider themeId="standard">
      <ThemeMark title="Familie auf Pfoten" />
    </ThemeProvider>
  )
  const svg = container.querySelector('svg')
  expect(svg.getAttribute('role')).toBe('img')
  expect(svg.getAttribute('aria-hidden')).toBeNull()
  expect(svg.querySelector('title').textContent).toBe('Familie auf Pfoten')
})

test('without a title, the svg is hidden from assistive tech', async () => {
  await render(
    <ThemeProvider themeId="standard">
      <ThemeMark />
    </ThemeProvider>
  )
  const svg = container.querySelector('svg')
  expect(svg.getAttribute('aria-hidden')).toBe('true')
  expect(svg.getAttribute('role')).toBeNull()
})

test('size sets width and height', async () => {
  await render(
    <ThemeProvider themeId="standard">
      <ThemeMark size={88} />
    </ThemeProvider>
  )
  const svg = container.querySelector('svg')
  expect(svg.getAttribute('width')).toBe('88')
  expect(svg.getAttribute('height')).toBe('88')
})

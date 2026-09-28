// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import { AppHeader, AppFooter, DemoBanner } from './App.jsx'
import { ThemeProvider } from './themes/ThemeProvider.jsx'
import { getTheme } from './themes/index.js'

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

describe.each(['standard', 'berner'])('App-Rahmen im Theme %s', (themeId) => {
  const theme = getTheme(themeId)

  test('Header zeigt den App-Namen des Themes als Markenname', async () => {
    await render(
      <MemoryRouter initialEntries={['/stammbaum']}>
        <ThemeProvider themeId={themeId}>
          <AppHeader family={{ name: 'Rudel vom Sonnenhang' }} onLogout={() => {}} />
        </ThemeProvider>
      </MemoryRouter>
    )
    expect(container.querySelector('.brand-name').textContent).toBe(theme.appName)
  })

  test('Footer zeigt den Footer-Text des Themes, Streifen nur wenn das Theme einen hat', async () => {
    await render(
      <MemoryRouter>
        <ThemeProvider themeId={themeId}>
          <AppFooter onInvite={() => {}} />
        </ThemeProvider>
      </MemoryRouter>
    )
    expect(container.querySelector('.app-footer p').textContent).toBe(theme.footer)
    const stripe = container.querySelector('.app-footer .tricolor')
    expect(stripe === null).toBe(!theme.tricolor)
  })

  test('DemoBanner-Button nutzt den Theme-Wortlaut für „eigene Familie/eigenes Rudel anlegen"', async () => {
    await render(
      <ThemeProvider themeId={themeId}>
        <DemoBanner onLeave={() => {}} />
      </ThemeProvider>
    )
    expect(container.querySelector('button').textContent).toBe(theme.words.createOwnGroup)
  })
})

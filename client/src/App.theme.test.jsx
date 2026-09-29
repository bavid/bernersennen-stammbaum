// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import { AppHeader, AppFooter } from './App.jsx'
import DemoBanner from './components/DemoBanner.jsx'
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

describe('DemoBanner in Partner- und Tierheim-Demos (Phase P2)', () => {
  // "Schreib dem Admin" nimmt aus Demo-Sitzungen nichts an (403) - deshalb die Kontaktdaten im Impressum.
  test('statt "Eigene Familie anlegen" führt der Knopf zum Kontakt im Impressum', async () => {
    const onLeave = () => {
      throw new Error('darf die Demo nicht verlassen')
    }
    await render(
      <MemoryRouter initialEntries={['/profil']}>
        <ThemeProvider themeId="standard">
          <DemoBanner onLeave={onLeave} partnerArea />
        </ThemeProvider>
      </MemoryRouter>
    )
    const link = container.querySelector('.demo-banner a')
    expect(link.textContent).toBe('Eigenes Partner-Profil? Kontakt im Impressum')
    expect(link.getAttribute('href')).toBe('/impressum')
    expect(container.querySelector('.demo-banner button')).toBeNull()
    expect(container.textContent).not.toContain('Eigene Familie anlegen')
  })
})

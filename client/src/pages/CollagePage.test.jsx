// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { listDogs } = vi.hoisted(() => ({ listDogs: vi.fn() }))
vi.mock('../api', () => ({ api: { listDogs } }))

import CollagePage from './CollagePage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { getTheme } from '../themes/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom hat keinen echten Canvas-2D-Context: fürs Titel-Layout im Bearbeiten-Modus reicht ein Fake
// mit fester, kleiner Textbreite (kein Layout-Test hier, nur der Theme-Wortschatz in der Werkzeugleiste).
const fakeContext = { measureText: () => ({ width: 10 }) }

let container
let getContextSpy

afterEach(() => {
  if (container) {
    act(() => container.remove())
    container = null
  }
  delete document.documentElement.dataset.theme
  document.title = ''
  window.localStorage.clear()
  listDogs.mockReset()
  getContextSpy?.mockRestore()
  getContextSpy = null
})

async function render(themeId, family) {
  listDogs.mockResolvedValue([])
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () =>
    createRoot(container).render(
      <ThemeProvider themeId={themeId}>
        <CollagePage family={family} />
      </ThemeProvider>
    )
  )
  return container
}

describe.each(['standard', 'berner'])('CollagePage im Theme %s', (themeId) => {
  const theme = getTheme(themeId)

  test('Setup-Ansicht nutzt den Theme-Wortschatz für Auswahl-Überschrift und Erstellen-Button', async () => {
    await render(themeId, { id: `setup-${themeId}`, name: 'Beispiel' })
    expect(container.querySelector('.collage-setup h2').textContent).toBe(`1. ${theme.words.animals} auswählen`)
    expect(container.querySelector('.collage-setup .btn-primary').textContent.trim()).toBe(
      `Collage erstellen (0 ${theme.words.animals})`
    )
  })

  test('Einleitungstext nennt Tiere/Hunde aus dem Theme-Wortschatz', async () => {
    await render(themeId, { id: `lede-${themeId}`, name: 'Beispiel' })
    expect(container.querySelector('.page-lede').textContent).toContain(`Mehrere ${theme.words.animals}, mehrere Seiten`)
  })

  test('Werkzeugleiste im Bearbeiten-Modus nutzt den Theme-Wortschatz', async () => {
    const family = { id: `edit-${themeId}`, name: 'Beispiel' }
    window.localStorage.setItem(
      `chronik.collageDraft.${family.id}`,
      JSON.stringify({ pages: [{ id: 'p1', title: 'Seite 1', subtitle: '', footer: '', photos: [] }], library: [] })
    )
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext)
    await render(themeId, family)
    const backButton = container.querySelector('.collage-toolbar .btn-ghost')
    expect(backButton.textContent.trim()).toBe(`${theme.words.animals} & Aufteilung`)
  })
})

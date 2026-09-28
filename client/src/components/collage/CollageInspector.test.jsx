// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'
import CollageInspector from './CollageInspector.jsx'
import { ThemeProvider } from '../../themes/ThemeProvider.jsx'
import { getTheme } from '../../themes/index.js'

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

const page = { id: 'p1', title: '', subtitle: '', footer: '', photos: [] }

async function render(themeId) {
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () =>
    createRoot(container).render(
      <ThemeProvider themeId={themeId}>
        <CollageInspector
          page={page}
          selectedPhoto={null}
          trayPhotos={[]}
          onPageChange={() => {}}
          onPhotoChange={() => {}}
          onMovePhoto={() => {}}
          onRemovePhoto={() => {}}
          onAddPhoto={() => {}}
          onDeletePage={() => {}}
          canDeletePage={false}
        />
      </ThemeProvider>
    )
  )
  return container
}

describe.each(['standard', 'berner'])('CollageInspector im Theme %s', (themeId) => {
  const theme = getTheme(themeId)

  test('Leerer Foto-Ablage-Hinweis nennt Tiere/Hunde aus dem Theme-Wortschatz', async () => {
    await render(themeId)
    expect(container.querySelector('.inspector-section .field-hint').textContent).toBe(
      `Alle Fotos der gewählten ${theme.words.animals} sind schon auf dieser Seite.`
    )
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'
import RenameFamilyForm from './RenameFamilyForm.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { getTheme } from '../themes/index.js'

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

async function render(themeId) {
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () =>
    createRoot(container).render(
      <ThemeProvider themeId={themeId}>
        <RenameFamilyForm family={{ name: 'Beispiel' }} onRenamed={() => {}} onCancel={() => {}} />
      </ThemeProvider>
    )
  )
  return container
}

describe.each(['standard', 'berner'])('RenameFamilyForm im Theme %s', (themeId) => {
  const theme = getTheme(themeId)

  test('Warnung und Feldbeschriftung nutzen den Theme-Wortschatz', async () => {
    await render(themeId)
    expect(container.querySelector('.warning-banner strong').textContent).toBe(`Das betrifft alle ${theme.words.inGroup}.`)
    expect(container.querySelector('.field-label').textContent).toBe(theme.words.newGroupName)
  })
})

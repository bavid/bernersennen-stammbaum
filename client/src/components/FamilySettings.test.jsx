// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'

const { updateFamily } = vi.hoisted(() => ({ updateFamily: vi.fn() }))
vi.mock('../api', () => ({ api: { updateFamily } }))

import FamilySettings from './FamilySettings.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const family = { id: 1, name: 'Familie Test', theme: 'standard', isDemo: false }

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  delete document.documentElement.dataset.theme
  document.title = ''
  updateFamily.mockReset()
})

async function render(onChange) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <ThemeProvider themeId="standard">
        <DemoProvider value={false}>
          <FamilySettings family={family} onRenamed={() => {}} onChange={onChange} onCancel={() => {}} />
        </DemoProvider>
      </ThemeProvider>
    )
  )
}

test('zeigt beide Abschnitte mit Überschriften "Name" und "Aussehen"', async () => {
  await render(() => {})
  const headings = [...container.querySelectorAll('.settings-section h3')].map((h) => h.textContent)
  expect(headings).toEqual(['Name', 'Aussehen'])
})

test('gibt die vom ThemePicker gespeicherte Antwort unverändert an onChange weiter', async () => {
  updateFamily.mockResolvedValue({ id: 1, name: 'Familie Test', theme: 'berner' })
  const onChange = vi.fn()
  await render(onChange)

  act(() => container.querySelector('input[type="radio"][value="berner"]').click())
  await act(async () => container.querySelector('.theme-picker-save').click())

  expect(onChange).toHaveBeenCalledWith({ id: 1, name: 'Familie Test', theme: 'berner' })
})

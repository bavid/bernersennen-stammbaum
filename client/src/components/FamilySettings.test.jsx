// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { updateFamily, leaveFamily } = vi.hoisted(() => ({ updateFamily: vi.fn(), leaveFamily: vi.fn() }))
vi.mock('../api', () => ({ api: { updateFamily, leaveFamily } }))

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
  leaveFamily.mockReset()
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

test('das Aussehen-Fieldset verweist per aria-labelledby auf die Überschrift statt eine zweite "Aussehen"-legend zu zeigen', async () => {
  await render(() => {})
  const heading = [...container.querySelectorAll('.settings-section h3')].find((h) => h.textContent === 'Aussehen')
  const fieldset = container.querySelector('.theme-picker')
  expect(heading.id).toBeTruthy()
  expect(fieldset.getAttribute('aria-labelledby')).toBe(heading.id)
  expect(fieldset.querySelector('legend')).toBeNull()
})

test('gibt die vom ThemePicker gespeicherte Antwort unverändert an onChange weiter', async () => {
  updateFamily.mockResolvedValue({ id: 1, name: 'Familie Test', theme: 'berner' })
  const onChange = vi.fn()
  await render(onChange)

  act(() => container.querySelector('input[type="radio"][value="berner"]').click())
  await act(async () => container.querySelector('.theme-picker-save').click())

  expect(onChange).toHaveBeenCalledWith({ id: 1, name: 'Familie Test', theme: 'berner' })
})

describe('FamilySettings – "Familie verlassen"', () => {
  const groupActive = {
    id: 3,
    name: 'Familie Sonnenhang',
    theme: 'standard',
    art: 'rudel',
    isDemo: false,
    home: { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' },
    memberships: [{ id: 3, name: 'Familie Sonnenhang' }]
  }

  async function renderWith(family, { isDemo = false } = {}, props = {}) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root.render(
        <MemoryRouter>
          <ThemeProvider themeId="standard">
            <DemoProvider value={isDemo}>
              <FamilySettings family={family} onRenamed={() => {}} onChange={() => {}} onCancel={() => {}} {...props} />
            </DemoProvider>
          </ThemeProvider>
        </MemoryRouter>
      )
    )
  }

  function heading() {
    return [...container.querySelectorAll('.settings-section h3')].find((h) => h.textContent === 'Familie verlassen')
  }

  test('erscheint, wenn die Identität ein Zuhause ist und gerade eine Familie aktiv ist', async () => {
    await renderWith(groupActive)
    expect(heading()).not.toBeUndefined()
  })

  test('erscheint nicht, wenn das eigene Zuhause selbst der aktive Bereich ist', async () => {
    await renderWith({ ...groupActive, id: 1, art: 'zuhause' })
    expect(heading()).toBeUndefined()
  })

  test('erscheint nicht in der Demo', async () => {
    await renderWith(groupActive, { isDemo: true })
    expect(heading()).toBeUndefined()
  })

  test('erscheint nicht bei einem klassischen Rudel-Login (Identität selbst ist ein Rudel, kein Zuhause)', async () => {
    await renderWith({ ...groupActive, home: { id: 3, name: 'Familie Sonnenhang', art: 'rudel' } })
    expect(heading()).toBeUndefined()
  })

  test('zweistufiges Verlassen ruft api.leaveFamily, dann onFamilyChange mit dem zurückgegebenen "me" und schließt', async () => {
    const me = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause', isDemo: false, home: groupActive.home, memberships: [] }
    leaveFamily.mockResolvedValue(me)
    const onFamilyChange = vi.fn()
    const onCancel = vi.fn()
    await renderWith(groupActive, {}, { onFamilyChange, onCancel })

    const button = () => [...container.querySelectorAll('.leave-family-section button')][0]
    act(() => button().click())
    expect(button().textContent).toContain('Ja,')

    await act(async () => button().click())

    expect(leaveFamily).toHaveBeenCalledWith(3)
    expect(onFamilyChange).toHaveBeenCalledWith(me)
    expect(onCancel).toHaveBeenCalled()
  })
})

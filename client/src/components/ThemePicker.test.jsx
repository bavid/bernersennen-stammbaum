// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { updateFamily } = vi.hoisted(() => ({ updateFamily: vi.fn() }))
vi.mock('../api', () => ({ api: { updateFamily } }))

import ThemePicker from './ThemePicker.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const family = { id: 1, name: 'Familie Test', theme: 'standard' }

let container
let root

function Wrapper({ show = true, isDemo = false, onSaved = () => {} }) {
  return (
    <ThemeProvider themeId="standard">
      <DemoProvider value={isDemo}>{show && <ThemePicker family={family} onSaved={onSaved} />}</DemoProvider>
    </ThemeProvider>
  )
}

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<Wrapper {...props} />))
  return container
}

async function update(props) {
  await act(async () => root.render(<Wrapper {...props} />))
}

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

function radio(id) {
  return container.querySelector(`input[type="radio"][value="${id}"]`)
}

function saveButton() {
  return container.querySelector('.theme-picker-save')
}

describe('ThemePicker', () => {
  test('zeigt beide Aussehen mit Label aus theme.label, Standard ist ausgewählt', async () => {
    await render()
    const options = [...container.querySelectorAll('.theme-option')]
    expect(options.map((option) => option.querySelector('.theme-option-label').textContent)).toEqual([
      'Familie auf Pfoten',
      'Berner'
    ])
    expect(radio('standard').checked).toBe(true)
    expect(radio('berner').checked).toBe(false)
  })

  test('Auswahl von Berner zeigt die Vorschau sofort am <html>', async () => {
    await render()
    act(() => radio('berner').click())
    expect(document.documentElement.dataset.theme).toBe('berner')
  })

  test('Übernehmen ist deaktiviert solange unverändert, speichert nach Auswahl', async () => {
    const onSaved = vi.fn()
    updateFamily.mockResolvedValue({ id: 1, name: 'Familie Test', theme: 'berner' })
    await render({ onSaved })

    expect(saveButton().disabled).toBe(true)
    act(() => radio('berner').click())
    expect(saveButton().disabled).toBe(false)

    await act(async () => saveButton().click())
    expect(updateFamily).toHaveBeenCalledWith({ theme: 'berner' })
    expect(onSaved).toHaveBeenCalledWith({ id: 1, name: 'Familie Test', theme: 'berner' })
  })

  test('Im Demo-Modus bleibt Übernehmen deaktiviert, ein Hinweis erscheint, Auswahl zeigt trotzdem die Vorschau', async () => {
    await render({ isDemo: true })
    expect(container.querySelector('.field-hint').textContent).toBe(
      'In der Demo nur als Vorschau – gespeichert wird nichts.'
    )
    expect(saveButton().disabled).toBe(true)
    act(() => radio('berner').click())
    expect(document.documentElement.dataset.theme).toBe('berner')
    expect(saveButton().disabled).toBe(true)
    expect(updateFamily).not.toHaveBeenCalled()
  })

  test('Unmount ohne Speichern setzt die Vorschau auf das gespeicherte Aussehen zurück', async () => {
    await render()
    act(() => radio('berner').click())
    expect(document.documentElement.dataset.theme).toBe('berner')

    await update({ show: false })
    expect(document.documentElement.dataset.theme).toBe('standard')
  })

  test('Ein Fehler beim Speichern zeigt die Meldung und behält die Vorschau', async () => {
    updateFamily.mockRejectedValue(new Error('Server nicht erreichbar'))
    await render()
    act(() => radio('berner').click())

    await act(async () => saveButton().click())

    expect(container.querySelector('[role="alert"]').textContent).toBe('Server nicht erreichbar')
    expect(document.documentElement.dataset.theme).toBe('berner')
  })
})

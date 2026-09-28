// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { view } = vi.hoisted(() => ({ view: vi.fn() }))
vi.mock('../api', () => ({ api: { view } }))

import ContextSwitcher from './ContextSwitcher.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom implementiert <dialog> nicht vollständig (kein showModal/close) – das Modal für "beitreten
// oder gründen" ruft beides beim Öffnen/Schließen auf.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

let container
let root

const family = {
  id: 3,
  name: 'Familie Klein',
  theme: 'standard',
  art: 'rudel',
  isDemo: false,
  home: { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' },
  memberships: [
    { id: 3, name: 'Familie Klein', theme: 'standard' },
    { id: 5, name: 'Rudel Nachbarn', theme: 'berner' }
  ]
}

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ThemeProvider themeId="standard">
          <ContextSwitcher family={family} onChange={() => {}} {...props} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
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
  view.mockReset()
})

function trigger() {
  return container.querySelector('.context-switcher-trigger')
}

function items() {
  return [...container.querySelectorAll('[role="menuitem"]')]
}

describe('ContextSwitcher', () => {
  test('Der Knopf zeigt den Namen des aktiven Bereichs, das Menü ist zunächst geschlossen', async () => {
    await render()
    expect(trigger().textContent).toContain('Familie Klein')
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
  })

  test('Menü listet „Meine Chronik" und die Mitgliedschaften, markiert den aktiven Bereich', async () => {
    await render()
    act(() => trigger().click())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    const labels = items().map((item) => item.textContent)
    expect(labels).toEqual(['Meine Chronik', 'Familie Klein', 'Rudel Nachbarn', 'Familie beitreten oder gründen …'])
    expect(items()[1].getAttribute('aria-current')).toBe('true')
    expect(items()[0].getAttribute('aria-current')).toBeNull()
    expect(items()[2].getAttribute('aria-current')).toBeNull()
  })

  test('Auswahl einer anderen Familie wechselt per api.view und ruft onChange', async () => {
    const onChange = vi.fn()
    const me = { ...family, id: 5, name: 'Rudel Nachbarn' }
    view.mockResolvedValue(me)
    await render({ onChange })
    act(() => trigger().click())
    await act(async () => items()[2].click())
    expect(view).toHaveBeenCalledWith(5)
    expect(onChange).toHaveBeenCalledWith(me)
  })

  test('Auswahl von "Meine Chronik" wechselt per api.view auf den Haushalt', async () => {
    const onChange = vi.fn()
    const me = { ...family, id: 1, name: 'Zuhause am Deich' }
    view.mockResolvedValue(me)
    await render({ onChange })
    act(() => trigger().click())
    await act(async () => items()[0].click())
    expect(view).toHaveBeenCalledWith(1)
    expect(onChange).toHaveBeenCalledWith(me)
  })

  test('Klick auf den bereits aktiven Bereich wechselt nicht erneut', async () => {
    const onChange = vi.fn()
    await render({ onChange })
    act(() => trigger().click())
    await act(async () => items()[1].click())
    expect(view).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })

  test('Escape schließt das Menü und gibt den Fokus an den Knopf zurück', async () => {
    await render()
    act(() => trigger().click())
    expect(container.querySelector('[role="menu"]')).not.toBeNull()
    act(() => items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  test('Pfeiltasten bewegen den Fokus zwischen den Menüpunkten', async () => {
    await render()
    act(() => trigger().click())
    expect(document.activeElement).toBe(items()[0])
    act(() => items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(document.activeElement).toBe(items()[1])
    act(() => items()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })))
    expect(document.activeElement).toBe(items()[0])
  })

  test('„Familie beitreten oder gründen …" öffnet den Dialog im Modal', async () => {
    await render()
    act(() => trigger().click())
    await act(async () => items()[3].click())
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(container.querySelector('.modal').open).toBe(true)
    expect(container.querySelector('.join-family')).not.toBeNull()
  })
})

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
  role: 'mitglied',
  home: { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' },
  memberships: [
    { id: 3, name: 'Familie Klein', theme: 'standard', rolle: 'mitglied' },
    { id: 5, name: 'Rudel Nachbarn', theme: 'berner', rolle: 'leitung' }
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

  test('Menü listet „Meine Chronik" (mit echtem Haushaltsnamen als Zusatz), die Mitgliedschaften mit Rolle und "Mitglieder & Rollen", markiert den aktiven Bereich', async () => {
    await render()
    act(() => trigger().click())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    const labels = items().map((item) => item.textContent)
    expect(labels).toEqual([
      'Meine Chronik · Zuhause am Deich',
      'Familie KleinMitglied',
      'Rudel NachbarnFamilienleitung',
      'Mitglieder & Rollen',
      'Familie beitreten oder gründen …'
    ])
    expect(items()[1].querySelector('.role-badge').textContent).toBe('Mitglied')
    expect(items()[1].getAttribute('aria-current')).toBe('true')
    expect(items()[0].getAttribute('aria-current')).toBeNull()
    expect(items()[2].getAttribute('aria-current')).toBeNull()
  })

  test('Der Knopf zeigt in einer Familie die eigene Rolle als Chip neben dem Namen (Phase R)', async () => {
    await render()
    expect(trigger().querySelector('.role-badge').textContent).toBe('Mitglied')
  })

  test('im Berner-Auftritt heißt die Leitung im Menü „Rudelführer"', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root.render(
        <MemoryRouter>
          <ThemeProvider themeId="berner">
            <ContextSwitcher family={family} onChange={() => {}} />
          </ThemeProvider>
        </MemoryRouter>
      )
    )
    act(() => trigger().click())
    expect(items()[2].querySelector('.role-badge').textContent).toBe('Rudelführer')
    expect(items()[3].textContent).toBe('Mitglieder & Rollen')
  })

  test('"Mitglieder & Rollen" führt zu /mitglieder und schließt das Menü', async () => {
    await render()
    act(() => trigger().click())
    await act(async () => items()[3].click())
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  test('Ist "Meine Chronik" aktiv, gibt es weder Rollen-Chip am Knopf noch "Mitglieder & Rollen" im Menü', async () => {
    await render({ family: { ...family, id: 1, name: 'Zuhause am Deich', art: 'zuhause', role: 'leitung' } })
    expect(trigger().querySelector('.role-badge')).toBeNull()
    act(() => trigger().click())
    expect(items().map((item) => item.textContent)).not.toContain('Mitglieder & Rollen')
  })

  test('Ist der Haushalt selbst der aktive Bereich, zeigen Knopf und Menüpunkt "Meine Chronik" statt des gespeicherten Namens', async () => {
    const homeActive = { ...family, id: 1, name: 'Zuhause am Deich' }
    await render({ family: homeActive })
    expect(trigger().textContent).toContain('Meine Chronik')
    expect(trigger().textContent).not.toContain('Zuhause am Deich')
    act(() => trigger().click())
    expect(items()[0].textContent).toBe('Meine Chronik · Zuhause am Deich')
    expect(items()[0].getAttribute('aria-current')).toBe('true')
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

  test('Home/End springen zum ersten/letzten Menüpunkt', async () => {
    await render()
    act(() => trigger().click())
    act(() => items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })))
    expect(document.activeElement).toBe(items()[items().length - 1])
    act(() => items()[items().length - 1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })))
    expect(document.activeElement).toBe(items()[0])
  })

  test('Tab schließt das Menü, statt es offen zu lassen (Fokus wandert normal weiter)', async () => {
    await render()
    act(() => trigger().click())
    expect(container.querySelector('[role="menu"]')).not.toBeNull()
    act(() => items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })))
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })

  test('nach dem Wechsel per Klick liegt der Fokus wieder auf dem Knopf statt auf body zu fallen', async () => {
    const onChange = vi.fn()
    const me = { ...family, id: 5, name: 'Rudel Nachbarn' }
    view.mockResolvedValue(me)
    await render({ onChange })
    act(() => trigger().click())
    await act(async () => items()[2].click())
    expect(document.activeElement).toBe(trigger())
  })

  test('„Familie beitreten oder gründen …" öffnet den Dialog im Modal', async () => {
    await render()
    act(() => trigger().click())
    await act(async () => items()[4].click())
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(container.querySelector('.modal').open).toBe(true)
    expect(container.querySelector('.join-family')).not.toBeNull()
  })

  // Phase V2: besuchte Zuhause (me.besuche) als "Zu Besuch bei …"
  const visitingHome = {
    ...family,
    id: 1,
    name: 'Zuhause am Deich',
    art: 'zuhause',
    role: 'leitung',
    memberships: [],
    besuche: [{ id: 9, name: 'Zuhause Möwenweg' }]
  }

  test('besuchte Zuhause stehen als „Zu Besuch bei …“ im Menü und wechseln per api.view', async () => {
    const onChange = vi.fn()
    const me = { ...visitingHome, id: 9, name: 'Zuhause Möwenweg', zuBesuch: true, role: 'gast' }
    view.mockResolvedValue(me)
    await render({ family: visitingHome, onChange })
    act(() => trigger().click())
    const visitItem = items().find((item) => item.textContent.includes('Zu Besuch bei Zuhause Möwenweg'))
    expect(visitItem).toBeTruthy()
    await act(async () => visitItem.click())
    expect(view).toHaveBeenCalledWith(9)
    expect(onChange).toHaveBeenCalledWith(me)
  })

  test('während eines Besuchs zeigt der Knopf „Zu Besuch bei …“ und markiert den Besuch im Menü', async () => {
    await render({ family: { ...visitingHome, id: 9, name: 'Zuhause Möwenweg', zuBesuch: true, role: 'gast' } })
    expect(trigger().textContent).toContain('Zu Besuch bei Zuhause Möwenweg')
    act(() => trigger().click())
    const current = items().find((item) => item.getAttribute('aria-current') === 'true')
    expect(current.textContent).toContain('Zu Besuch bei Zuhause Möwenweg')
  })
})

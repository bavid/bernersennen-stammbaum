// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import AccountMenu from './AccountMenu.jsx'
import AccountSheet, { MenuSlotButton } from './AccountSheet.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom kennt showModal/close des <dialog> nicht vollständig.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

const home = { id: 1, name: 'Zuhause Lindenhof', art: 'zuhause' }
const atHome = { ...home, home, role: 'leitung', memberships: [] }
const visiting = { id: 9, name: 'Zuhause Möwenweg', art: 'zuhause', zuBesuch: true, role: 'gast', home }
const classic = { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel', role: 'leitung', home: { id: 2, name: 'Rudel vom Heidekamp', art: 'rudel' } }

let container
let root

function Where() {
  const location = useLocation()
  return <output data-testid="where">{`${location.pathname}|${location.state?.from ?? ''}`}</output>
}

async function render(ui, path = '/start') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        {ui}
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    )
  )
}

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
})

const trigger = () => container.querySelector('.account-menu-trigger')
const items = () => [...container.querySelectorAll('.account-menu-panel [role="menuitem"]')]
const labels = () => items().map((item) => item.textContent)
const where = () => container.querySelector('[data-testid="where"]').textContent

function key(target, name) {
  act(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true })))
}

describe('AccountMenu (Phase W)', () => {
  test('Knopf: Anfangsbuchstabe und Name des Zuhauses, geschlossen; öffnet auf Klick mit dem Fokus auf dem ersten Eintrag', async () => {
    await render(<AccountMenu family={{ ...atHome, id: 5, art: 'rudel' }} onInvite={() => {}} onLogout={() => {}} />)
    expect(trigger().textContent).toBe('LMenü: Zuhause Lindenhof')
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[role="menu"]')).toBeNull()

    act(() => trigger().click())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[role="menu"]').id).toBe(trigger().getAttribute('aria-controls'))
    expect(document.activeElement).toBe(items()[0])
  })

  test('Einträge im eigenen Zuhause, dazu klein Impressum und Datenschutz', async () => {
    await render(<AccountMenu family={atHome} onInvite={() => {}} onLogout={() => {}} />)
    act(() => trigger().click())
    expect(labels()).toEqual(['Einstellungen', 'Einladen', 'Fotocollage', 'Bilderrahmen', 'Hilfe & Kontakt', 'Abmelden', 'Impressum', 'Datenschutz'])
    expect(items().map((item) => item.getAttribute('href'))).toEqual(['/einstellungen', null, '/collage', '/bilderrahmen', '/admin-schreiben', null, '/impressum', '/datenschutz'])
  })

  test('zu Besuch Einladen aus dem eigenen Zuhause (Phase W, Schritt 2); klassischer Login mit Mitglieder; Demo zeigt alles', async () => {
    await render(<AccountMenu family={visiting} onInvite={() => {}} onLogout={() => {}} />)
    act(() => trigger().click())
    expect(labels()).toContain('Einladen')
    expect(trigger().textContent).toContain('Zuhause Lindenhof')
    act(() => root.unmount())
    container.remove()

    await render(<AccountMenu family={classic} onInvite={() => {}} onLogout={() => {}} />)
    act(() => trigger().click())
    expect(labels()).toContain('Mitglieder')
    act(() => root.unmount())
    container.remove()

    await render(<AccountMenu family={{ ...atHome, isDemo: true }} onInvite={() => {}} onLogout={() => {}} />)
    act(() => trigger().click())
    expect(labels()).toEqual(['Einstellungen', 'Einladen', 'Fotocollage', 'Bilderrahmen', 'Hilfe & Kontakt', 'Abmelden', 'Impressum', 'Datenschutz'])
  })

  test('Tastatur: Pfeile wandern (rundum), Pos1/Ende springen, Escape schließt und gibt den Fokus zurück', async () => {
    await render(<AccountMenu family={atHome} onInvite={() => {}} onLogout={() => {}} />)
    key(trigger(), 'ArrowDown')
    expect(document.activeElement).toBe(items()[0])
    const menu = container.querySelector('[role="menu"]')
    key(menu, 'ArrowDown')
    expect(document.activeElement).toBe(items()[1])
    key(menu, 'ArrowUp')
    key(menu, 'ArrowUp')
    expect(document.activeElement).toBe(items()[items().length - 1])
    key(menu, 'Home')
    expect(document.activeElement).toBe(items()[0])
    key(menu, 'End')
    expect(document.activeElement.textContent).toBe('Datenschutz')
    key(menu, 'Escape')
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  test('Tab schließt nur; ein Klick außerhalb schließt', async () => {
    await render(<AccountMenu family={atHome} onInvite={() => {}} onLogout={() => {}} />)
    act(() => trigger().click())
    key(container.querySelector('[role="menu"]'), 'Tab')
    expect(container.querySelector('[role="menu"]')).toBeNull()

    act(() => trigger().click())
    act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })

  test('Einladen und Abmelden rufen ihre Handler; Hilfe & Kontakt nimmt die Seite mit', async () => {
    const onInvite = vi.fn()
    const onLogout = vi.fn()
    await render(<AccountMenu family={atHome} onInvite={onInvite} onLogout={onLogout} />, '/tiere')
    act(() => trigger().click())
    act(() => items().find((item) => item.textContent === 'Einladen').click())
    expect(onInvite).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="menu"]')).toBeNull()
    // Der Fokus fällt nicht auf <body>, sondern zurück an den Knopf des Menüs
    expect(document.activeElement).toBe(trigger())

    act(() => trigger().click())
    act(() => items().find((item) => item.textContent === 'Abmelden').click())
    expect(onLogout).toHaveBeenCalledTimes(1)

    act(() => trigger().click())
    act(() => items().find((item) => item.textContent === 'Hilfe & Kontakt').click())
    expect(where()).toBe('/admin-schreiben|/tiere')
  })
})

describe('Menü am Handy (MenuSlotButton + AccountSheet)', () => {
  function Sheet({ family, onInvite = () => {}, onLogout = () => {} }) {
    return <AccountSheet family={family} open onClose={() => {}} onInvite={onInvite} onLogout={onLogout} />
  }

  test('der fünfte Platz heißt "Menü" und meldet das Öffnen', async () => {
    const onOpen = vi.fn()
    await render(<MenuSlotButton open={false} onOpen={onOpen} />)
    const button = container.querySelector('.app-nav-menu')
    expect(button.textContent).toBe('Menü')
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    act(() => button.click())
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  test('das Blatt zeigt dieselben Einträge als Liste mit großen Flächen', async () => {
    const onLogout = vi.fn()
    await render(<Sheet family={atHome} onLogout={onLogout} />)
    const dialog = container.querySelector('dialog.modal.modal-sheet')
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector('#modal-title').textContent).toBe('Menü')
    expect([...dialog.querySelectorAll('.account-sheet-item')].map((item) => item.textContent)).toEqual([
      'Einstellungen',
      'Einladen',
      'Fotocollage',
      'Bilderrahmen',
      'Hilfe & Kontakt',
      'Abmelden'
    ])
    expect([...dialog.querySelectorAll('.account-sheet-legal a')].map((a) => a.getAttribute('href'))).toEqual(['/impressum', '/datenschutz'])
    act(() => [...dialog.querySelectorAll('.account-sheet-item')].at(-1).click())
    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me, logout, messages, markMessageRead, deleteMessage, posts } = vi.hoisted(() => ({
  me: vi.fn(),
  logout: vi.fn(),
  messages: vi.fn(),
  markMessageRead: vi.fn(),
  deleteMessage: vi.fn(),
  posts: vi.fn()
}))
vi.mock('./api', () => ({
  api: { me, logout, partnerArea: { messages, markMessageRead, deleteMessage, posts } },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom implementiert <dialog> nicht vollständig (kein showModal/close) – der Weitergabe-Dialog läuft im Modal.
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

// ScrollToTop ruft window.scrollTo - jsdom kennt es nicht (nur Rauschen in der Ausgabe).
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

const partnerArea = {
  id: 30,
  name: 'Hundeschule Wiesengrund',
  theme: 'standard',
  art: 'partner',
  isDemo: false,
  home: { id: 30, name: 'Hundeschule Wiesengrund', theme: 'standard', art: 'partner' },
  memberships: [],
  auth: { kind: 'key' },
  partner: { id: 4, slug: 'hundeschule-wiesengrund', name: 'Hundeschule Wiesengrund', typ: 'hundeschule', status: 'aktiv', gesperrt: false, unread: 2 }
}

const inbox = [
  { id: 2, name: 'Wilma', email: 'wilma@example.org', telefon: null, bezug: null, nachricht: 'Habt ihr noch Plätze?', gelesen: false, gelesenAt: null, createdAt: '2026-09-20 12:00:00' },
  { id: 1, name: 'Lotte', email: null, telefon: '040 123456', bezug: null, nachricht: 'Wann startet der nächste Kurs?', gelesen: false, gelesenAt: null, createdAt: '2026-09-19 12:00:00' }
]

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  for (const mock of [me, logout, messages, markMessageRead, deleteMessage, posts]) mock.mockReset()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

async function render(path, family = partnerArea) {
  me.mockResolvedValue(family)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    )
  )
  // Beiträge und Nachrichten lädt AreaRoutes per React.lazy nach.
  await act(() => vi.dynamicImportSettled())
}

function inboxLink() {
  return [...container.querySelectorAll('.app-nav a')].find((a) => a.getAttribute('href') === '/nachrichten')
}

describe('Nachrichten in der Navigation (Phase P2)', () => {
  test('Badge mit der Zahl ungelesener Nachrichten und sprechendem Namen für Screenreader', async () => {
    posts.mockResolvedValue([])
    await render('/beitraege')

    const link = inboxLink()
    expect(link.getAttribute('aria-label')).toBe('Nachrichten, 2 ungelesen')
    const badge = link.querySelector('.app-nav-badge')
    expect(badge.textContent).toBe('2')
    expect(badge.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('h1').textContent).toBe('Beiträge')
  })

  test('ohne ungelesene: kein Badge, kein eigener aria-label', async () => {
    posts.mockResolvedValue([])
    await render('/beitraege', { ...partnerArea, partner: { ...partnerArea.partner, unread: 0 } })

    expect(inboxLink().querySelector('.app-nav-badge')).toBeNull()
    expect(inboxLink().hasAttribute('aria-label')).toBe(false)
  })

  test('Lesen und Löschen im Postfach aktualisieren das Badge ohne neues Laden von /api/me', async () => {
    messages.mockResolvedValue({ messages: inbox, unread: 2 })
    markMessageRead.mockResolvedValue({ ...inbox[0], gelesen: true, gelesenAt: '2026-09-21 09:00:00' })
    deleteMessage.mockResolvedValue(null)
    await render('/nachrichten')

    expect(container.querySelector('h1').textContent).toBe('Nachrichten')
    expect(inboxLink().classList.contains('active')).toBe(true)

    await act(async () => container.querySelectorAll('.inbox-item-head')[0].click())
    expect(markMessageRead).toHaveBeenCalledWith(2)
    expect(inboxLink().getAttribute('aria-label')).toBe('Nachrichten, 1 ungelesen')
    expect(inboxLink().querySelector('.app-nav-badge').textContent).toBe('1')

    await act(async () => container.querySelectorAll('.inbox-item-head')[1].click())
    // Die zweite ist jetzt auch gelesen - danach gibt es kein Badge mehr.
    expect(inboxLink().querySelector('.app-nav-badge')).toBeNull()
    expect(me).toHaveBeenCalledTimes(1)
  })

  test('meldet der Server beim Öffnen des Postfachs mehr ungelesene als /api/me, zieht das Badge nach', async () => {
    messages.mockResolvedValue({ messages: [...inbox, { ...inbox[1], id: 7, name: 'Pepper' }], unread: 3 })
    await render('/nachrichten')
    expect(inboxLink().getAttribute('aria-label')).toBe('Nachrichten, 3 ungelesen')
  })
})

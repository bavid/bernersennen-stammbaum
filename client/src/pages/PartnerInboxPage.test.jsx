// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { messages, markMessageRead, deleteMessage } = vi.hoisted(() => ({
  messages: vi.fn(),
  markMessageRead: vi.fn(),
  deleteMessage: vi.fn()
}))
vi.mock('../api', () => ({ api: { partnerArea: { messages, markMessageRead, deleteMessage } } }))

import PartnerInboxPage from './PartnerInboxPage.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const family = {
  id: 5,
  name: 'Tierheim Sonnenhang',
  art: 'tierheim',
  partner: { id: 1, slug: 'tierheim-sonnenhang', name: 'Tierheim Sonnenhang', typ: 'tierheim', status: 'aktiv', gesperrt: false, unread: 2 }
}

function message(overrides) {
  return {
    id: 1,
    name: 'Wilma',
    email: 'wilma@example.org',
    telefon: null,
    bezug: null,
    nachricht: 'Hallo, habt ihr noch Plätze im Welpenkurs?',
    gelesen: false,
    gelesenAt: null,
    createdAt: '2026-09-20 12:00:00',
    ...overrides
  }
}

const inbox = [
  message({ id: 3, name: null, email: null, telefon: '0171 2345678', bezug: 'Anfrage zu Benno', nachricht: 'Ist Benno noch da?\nWir hätten Zeit am Samstag.' }),
  message({ id: 2 }),
  message({ id: 1, name: 'Flocke Meyer', gelesen: true, gelesenAt: '2026-09-19 08:00:00', createdAt: '2026-09-18 12:00:00' })
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
  for (const mock of [messages, markMessageRead, deleteMessage]) mock.mockReset()
})

async function render({ list = inbox, unread = 2, isDemo = false, onFamilyChange = vi.fn() } = {}) {
  messages.mockResolvedValue({ messages: list, unread })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DemoProvider value={isDemo}>
          <PartnerInboxPage family={family} onFamilyChange={onFamilyChange} />
        </DemoProvider>
      </MemoryRouter>
    )
  )
  return onFamilyChange
}

function items() {
  return [...container.querySelectorAll('.inbox-item')]
}

async function click(element) {
  await act(async () => element.click())
}

// onFamilyChange bekommt (wie setFamily) einen Updater - hier auf die family angewendet.
function lastUnread(onFamilyChange) {
  const updater = onFamilyChange.mock.calls.at(-1)[0]
  return updater(family).partner.unread
}

describe('PartnerInboxPage – Liste', () => {
  test('neueste zuerst, ungelesene hervorgehoben, Bezug als Chip, "Ohne Namen" und deutsches Datum', async () => {
    await render()

    expect(container.querySelector('h1').textContent).toBe('Nachrichten')
    expect(container.textContent).toContain('Nachrichten werden nach 180 Tagen automatisch gelöscht.')
    const [first, second, third] = items()
    expect(first.querySelector('.inbox-item-sender').textContent).toBe('Ohne Namen (ungelesen)')
    expect(first.classList.contains('is-unread')).toBe(true)
    expect(first.querySelector('.inbox-bezug').textContent).toBe('Anfrage zu Benno')
    expect(first.querySelector('time').textContent).toMatch(/^20\. September 2026/)
    expect(first.querySelector('time').getAttribute('datetime')).toBe('2026-09-20T12:00:00.000Z')
    expect(second.querySelector('.inbox-item-sender').textContent).toBe('Wilma (ungelesen)')
    expect(third.classList.contains('is-unread')).toBe(false)
    expect(third.querySelector('.inbox-item-sender').textContent).toBe('Flocke Meyer')
    expect(container.querySelector('.inbox-summary').textContent).toBe('3 Nachrichten, davon 2 ungelesen')
  })

  test('leeres Postfach: Hinweis auf "Schreib uns"', async () => {
    await render({ list: [], unread: 0 })
    expect(container.textContent).toContain('Noch keine Nachrichten. Sobald jemand über ‚Schreib uns‘ schreibt, landet es hier.')
    expect(container.querySelector('.inbox-list')).toBeNull()
  })
})

describe('PartnerInboxPage – Öffnen, Lesen, Löschen', () => {
  test('Öffnen zeigt die ganze Nachricht mit Antwort-Links und markiert sie über die API als gelesen', async () => {
    markMessageRead.mockResolvedValue({ ...inbox[0], gelesen: true, gelesenAt: '2026-09-21 09:00:00' })
    const onFamilyChange = await render()
    expect(lastUnread(onFamilyChange)).toBe(2)

    const head = items()[0].querySelector('.inbox-item-head')
    expect(head.getAttribute('aria-expanded')).toBe('false')
    await click(head)

    expect(head.getAttribute('aria-expanded')).toBe('true')
    expect(markMessageRead).toHaveBeenCalledWith(3)
    const detail = items()[0].querySelector('.inbox-item-detail')
    expect(detail.querySelector('.inbox-message-text').textContent).toBe('Ist Benno noch da?\nWir hätten Zeit am Samstag.')
    expect(detail.querySelector('a[href^="tel:"]').getAttribute('href')).toBe('tel:01712345678')
    expect(detail.querySelector('a[href^="mailto:"]')).toBeNull()

    expect(items()[0].classList.contains('is-unread')).toBe(false)
    expect(lastUnread(onFamilyChange)).toBe(1)
    expect(container.querySelector('.inbox-summary').textContent).toBe('3 Nachrichten, davon 1 ungelesen')
  })

  test('eine schon gelesene Nachricht wird beim Öffnen nicht noch einmal markiert; E-Mail als mailto-Link', async () => {
    await render()
    await click(items()[2].querySelector('.inbox-item-head'))
    expect(markMessageRead).not.toHaveBeenCalled()
    expect(items()[2].querySelector('a[href^="mailto:"]').getAttribute('href')).toBe('mailto:wilma@example.org')
  })

  test('Nachrichten bleiben reiner Text - "<b>" erscheint als Text, nie als HTML', async () => {
    markMessageRead.mockResolvedValue({ ...inbox[1], gelesen: true })
    const list = [message({ id: 2, name: '<b>Pepper</b>', nachricht: 'Hallo <b>fett</b> <img src=x onerror=alert(1)>' })]
    await render({ list, unread: 1 })

    await click(items()[0].querySelector('.inbox-item-head'))
    const text = container.querySelector('.inbox-message-text')
    expect(text.textContent).toBe('Hallo <b>fett</b> <img src=x onerror=alert(1)>')
    expect(text.querySelector('b')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.inbox-item-sender b')).toBeNull()
  })

  test('schlägt das Markieren fehl, gibt es "Als gelesen markieren" zum erneuten Versuch', async () => {
    markMessageRead.mockRejectedValueOnce(new Error('Keine Verbindung zum Server.')).mockResolvedValueOnce({ ...inbox[1], gelesen: true })
    const onFamilyChange = await render()

    await click(items()[1].querySelector('.inbox-item-head'))
    expect(container.querySelector('[role="alert"]').textContent).toBe('Keine Verbindung zum Server.')
    const retry = [...items()[1].querySelectorAll('button')].find((btn) => btn.textContent.includes('Als gelesen markieren'))

    await click(retry)
    expect(markMessageRead).toHaveBeenCalledTimes(2)
    expect(items()[1].classList.contains('is-unread')).toBe(false)
    expect(lastUnread(onFamilyChange)).toBe(1)
  })

  test('Löschen mit Bestätigung - eine ungelesene zählt danach nicht mehr mit', async () => {
    markMessageRead.mockRejectedValue(new Error('offline'))
    deleteMessage.mockResolvedValue(null)
    const onFamilyChange = await render()

    await click(items()[0].querySelector('.inbox-item-head'))
    const remove = items()[0].querySelector('.btn-danger')
    expect(remove.getAttribute('aria-label')).toBe('Nachricht von Ohne Namen löschen')
    await click(remove)
    expect(deleteMessage).not.toHaveBeenCalled()
    await click(remove)

    expect(deleteMessage).toHaveBeenCalledWith(3)
    expect(items()).toHaveLength(2)
    expect(lastUnread(onFamilyChange)).toBe(1)
  })
})

describe('PartnerInboxPage – Demo', () => {
  test('nur lesen: Öffnen markiert nichts, Löschen ist gesperrt', async () => {
    await render({ isDemo: true })

    expect(container.querySelector('#inbox-demo-hint').textContent).toContain('In der Demo nur zum Ansehen')
    await click(items()[0].querySelector('.inbox-item-head'))
    expect(markMessageRead).not.toHaveBeenCalled()
    expect(items()[0].querySelector('.inbox-message-text')).not.toBeNull()
    const remove = items()[0].querySelector('.btn-danger')
    expect(remove.disabled).toBe(true)
    expect(remove.getAttribute('aria-describedby')).toBe('inbox-demo-hint')
    expect([...items()[0].querySelectorAll('button')].some((btn) => btn.textContent.includes('Als gelesen markieren'))).toBe(false)
  })
})

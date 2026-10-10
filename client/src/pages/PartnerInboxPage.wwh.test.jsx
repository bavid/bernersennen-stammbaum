// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  messages: vi.fn(() => Promise.resolve({ messages: [], unread: 0 })),
  markMessageRead: vi.fn(),
  deleteMessage: vi.fn(),
  wwh: vi.fn(),
  wwhDecideCheckin: vi.fn(),
  wwhDecidePin: vi.fn(),
  wwhRemoveCheckin: vi.fn()
}))
vi.mock('../api', () => ({ api: { partnerArea: mocks } }))

import PartnerInboxPage from './PartnerInboxPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const family = { id: 5, name: 'Hundeschule Pfotenglück', art: 'partner', partner: { id: 7, name: 'Hundeschule Pfotenglück', unread: 0 } }
let container
let root

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('PartnerInboxPage – Reiter „Wir waren hier“', () => {
  test('Reiter mit Zahl offener Anfragen; Wechsel zeigt die Freigaben', async () => {
    mocks.wwh.mockResolvedValue({
      anmeldungen: [{ id: 1, status: 'offen', createdAt: '2026-10-01 10:00:00', tierName: 'Benno', tierart: 'hund', fotoUrl: null }],
      erinnerungen: []
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root.render(
        <MemoryRouter>
          <PartnerInboxPage family={family} onFamilyChange={vi.fn()} />
        </MemoryRouter>
      )
    )
    const tabs = [...container.querySelectorAll('[role="tab"]')]
    expect(tabs.map((tab) => tab.firstChild.textContent)).toEqual(['Nachrichten', 'Wir waren hier'])
    expect(tabs[1].querySelector('.tab-bar-count').textContent).toBe('1')
    const panel = container.querySelector('#inbox-panel-wir-waren-hier')
    expect(panel.hidden).toBe(true)

    await act(async () => tabs[1].click())
    expect(panel.hidden).toBe(false)
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(panel.textContent).toContain('Benno')
  })
})

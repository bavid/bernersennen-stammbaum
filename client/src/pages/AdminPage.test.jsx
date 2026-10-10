// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me, overview, partners, logout, reported } = vi.hoisted(() => ({
  me: vi.fn(),
  overview: vi.fn(),
  partners: vi.fn(),
  logout: vi.fn(),
  // Was die Platzhalter für Anfragen und Freigaben als offen melden.
  reported: { anfragen: 2, freigaben: 1 }
}))
vi.mock('../api', () => ({ api: { admin: { me, overview, partners, logout } } }))

// Die Karten selbst haben eigene Tests - hier stehen sie als schlichte Platzhalter. Anfragen und Freigaben melden
// ihren Zähler wie die echten Karten (onCountChange beim Laden).
vi.mock('../components/AdminAnfragen.jsx', () => ({
  default: function AdminAnfragen({ onCountChange }) {
    useEffect(() => onCountChange(reported.anfragen), [onCountChange])
    return <p data-testid="anfragen">Anfragen-Karte</p>
  }
}))
vi.mock('../components/AdminPostApproval.jsx', () => ({
  default: function AdminPostApproval({ onCountChange }) {
    useEffect(() => onCountChange(reported.freigaben), [onCountChange])
    return <p data-testid="freigaben">Freigabe-Karte</p>
  }
}))
vi.mock('../components/AdminStats.jsx', () => ({ default: () => <p data-testid="kennzahlen">Kennzahlen</p> }))
vi.mock('../components/AdminVouchers.jsx', () => ({ default: () => <p data-testid="gutscheine">Gutschein-Karte</p> }))
vi.mock('../components/AdminPartners.jsx', () => ({ default: () => <p data-testid="partner">Partner-Karte</p> }))
vi.mock('../components/AdminPromotions.jsx', () => ({ default: () => <p data-testid="empfehlungen">Empfehlungen-Karte</p> }))
vi.mock('../components/AdminCommunityBanner.jsx', () => ({ default: () => <p data-testid="band">Band-Karte</p> }))
vi.mock('../components/AdminSupport.jsx', () => ({ default: () => <p data-testid="spenden">Spenden-Karte</p> }))
vi.mock('../components/AdminFamilyList.jsx', () => ({ default: () => <p data-testid="familien">Familien-Karte</p> }))
vi.mock('../components/AdminMessages.jsx', () => ({ default: () => <p data-testid="nachrichten">Nachrichten-Karte</p> }))
vi.mock('../components/AdminNotify.jsx', () => ({ default: () => <p data-testid="telegram">Telegram-Karte</p> }))
vi.mock('../components/AdminEinladungskarte.jsx', () => ({ default: () => <p data-testid="einladungskarte">Einladungskarte-Karte</p> }))
vi.mock('../components/AdminHinweise.jsx', () => ({ default: () => <p data-testid="hinweise">Hinweise-Karte</p> }))
vi.mock('../components/AdminServer.jsx', () => ({ default: () => <p data-testid="server">Server-Karte</p> }))
vi.mock('../components/AdminLog.jsx', () => ({ default: () => <p data-testid="protokoll">Protokoll-Karte</p> }))

import AdminPage from './AdminPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let currentSearch

function LocationProbe() {
  currentSearch = useLocation().search
  return null
}

const stats = {
  openMessages: 3,
  families: 4,
  dogs: 12,
  entries: 30,
  notes: 5,
  replies: 2,
  breeding: 1,
  uploads: { files: 8, bytes: 3 * 1024 * 1024 }
}

beforeEach(() => {
  currentSearch = null
  reported.anfragen = 2
  reported.freigaben = 1
  me.mockResolvedValue({ username: 'admin' })
  overview.mockResolvedValue({ stats, families: [] })
  partners.mockResolvedValue([])
  logout.mockResolvedValue(null)
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  vi.clearAllMocks()
})

async function render(path = '/admin') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <AdminPage />
        <LocationProbe />
      </MemoryRouter>
    )
  )
}

function tabs() {
  return [...container.querySelectorAll('[role="tab"]')]
}

function tab(label) {
  return tabs().find((el) => el.firstChild.textContent === label)
}

function selectedTab() {
  return tabs().find((el) => el.getAttribute('aria-selected') === 'true')
}

function visiblePanel() {
  return [...container.querySelectorAll('[role="tabpanel"]')].find((panel) => !panel.hidden)
}

async function click(element) {
  await act(async () => element.click())
}

async function press(key) {
  await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
}

describe('AdminPage – Reiter (Phase U)', () => {
  test('Kopf mit Titel "Admin", Präsentation, Bausteine und Abmelden; zwölf Reiter in einer echten Tabliste', async () => {
    await render()

    expect(container.querySelector('.admin-header h1').textContent).toBe('Admin')
    const links = [...container.querySelectorAll('.admin-header-actions a, .admin-header-actions button')].map((el) => el.textContent.trim())
    expect(links).toEqual(['Präsentation', 'Bausteine', 'Abmelden'])
    expect(container.querySelector('[role="tablist"]').getAttribute('aria-label')).toBe('Admin-Bereiche')
    expect(tabs().map((el) => el.firstChild.textContent)).toEqual([
      'Übersicht',
      'Anfragen',
      'Freigaben',
      'Einladungscodes',
      'Partner',
      'Empfehlungen & Spenden',
      'Familien',
      'Nachrichten',
      'Hinweise',
      'Finanzierung',
      'Einstellungen',
      'Server',
      'Protokoll'
    ])
    expect(selectedTab().textContent.startsWith('Übersicht')).toBe(true)
    expect(selectedTab().getAttribute('tabindex')).toBe('0')
    expect(tab('Anfragen').getAttribute('tabindex')).toBe('-1')
  })

  test('Zähler an Anfragen, Freigaben und Nachrichten - vorgelesen als "n offen", ohne Zahl bei nichts Offenem', async () => {
    await render()

    const count = (label) => tab(label).querySelector('.tab-bar-count')?.textContent
    expect(count('Anfragen')).toBe('2')
    expect(count('Freigaben')).toBe('1')
    expect(count('Nachrichten')).toBe('3')
    expect(count('Einladungscodes')).toBeUndefined()
    expect(tab('Anfragen').querySelector('.tab-bar-count').getAttribute('aria-hidden')).toBe('true')
    expect(tab('Anfragen').textContent).toBe('Anfragen2 (2 offen)')
  })

  test('jeder Reiter steuert sein Panel; nur das gewählte ist sichtbar', async () => {
    await render()

    for (const el of tabs()) {
      const panel = document.getElementById(el.getAttribute('aria-controls'))
      expect(panel.getAttribute('role')).toBe('tabpanel')
      expect(panel.getAttribute('aria-labelledby')).toBe(el.id)
    }
    expect(visiblePanel().id).toBe('admin-panel-uebersicht')
    expect(visiblePanel().querySelector('[data-testid="kennzahlen"]')).not.toBeNull()
  })

  test('?tab=gutscheine wählt den Reiter aus der Adresse, ein unbekannter Wert landet bei Übersicht', async () => {
    await render('/admin?tab=gutscheine')
    expect(selectedTab().firstChild.textContent).toBe('Einladungscodes')
    expect(visiblePanel().querySelector('[data-testid="gutscheine"]')).not.toBeNull()

    act(() => root.unmount())
    container.remove()
    await render('/admin?tab=gibtesnicht')
    expect(selectedTab().firstChild.textContent).toBe('Übersicht')
  })

  test('ein Klick wechselt den Reiter und schreibt ihn in die Adresse; Übersicht ohne Parameter', async () => {
    await render()

    await click(tab('Partner'))
    expect(currentSearch).toBe('?tab=partner')
    expect(visiblePanel().querySelector('[data-testid="partner"]')).not.toBeNull()

    await click(tab('Übersicht'))
    expect(currentSearch).toBe('')
  })

  test('Karten laden erst beim ersten Öffnen und bleiben danach eingehängt; Anfragen und Freigaben sofort', async () => {
    await render()

    expect(container.querySelector('[data-testid="anfragen"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="freigaben"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="gutscheine"]')).toBeNull()

    await click(tab('Einladungscodes'))
    await click(tab('Familien'))
    expect(container.querySelector('[data-testid="gutscheine"]')).not.toBeNull()
    expect(document.getElementById('admin-panel-gutscheine').hidden).toBe(true)
  })

  test('Empfehlungen & Spenden zeigt beide Karten, Einstellungen die Telegram-Benachrichtigungen', async () => {
    await render('/admin?tab=empfehlungen')
    expect(visiblePanel().querySelector('[data-testid="empfehlungen"]')).not.toBeNull()
    expect(visiblePanel().querySelector('[data-testid="spenden"]')).not.toBeNull()

    await click(tab('Einstellungen'))
    expect(visiblePanel().querySelector('[data-testid="telegram"]')).not.toBeNull()
    // Einladungskarten: die Rückseite, die Familie auf Pfoten gestaltet, steht ebenfalls unter "Einstellungen".
    expect(visiblePanel().querySelector('[data-testid="einladungskarte"]')).not.toBeNull()
  })

  test('Hinweise (Phase N Task 5): eigener Reiter vor den Einstellungen, per ?tab=hinweise erreichbar', async () => {
    await render('/admin?tab=hinweise')
    expect(selectedTab().firstChild.textContent).toBe('Hinweise')
    expect(visiblePanel().querySelector('[data-testid="hinweise"]')).not.toBeNull()
  })

  test('Server (Phase G Task 6): eigener Reiter nach den Einstellungen, per ?tab=server erreichbar', async () => {
    await render('/admin?tab=server')
    expect(selectedTab().firstChild.textContent).toBe('Server')
    expect(visiblePanel().querySelector('[data-testid="server"]')).not.toBeNull()
  })

  test('Pfeiltasten, Pos1 und Ende wechseln den Reiter und den Fokus', async () => {
    await render()
    act(() => tab('Übersicht').focus())

    await press('ArrowRight')
    expect(selectedTab().firstChild.textContent).toBe('Anfragen')
    expect(document.activeElement).toBe(tab('Anfragen'))
    expect(currentSearch).toBe('?tab=anfragen')

    await press('End')
    expect(selectedTab().firstChild.textContent).toBe('Protokoll')
    await press('ArrowRight')
    expect(selectedTab().firstChild.textContent).toBe('Übersicht')
    await press('ArrowLeft')
    expect(selectedTab().firstChild.textContent).toBe('Protokoll')
    await press('Home')
    expect(selectedTab().firstChild.textContent).toBe('Übersicht')
    expect(document.activeElement).toBe(tab('Übersicht'))
  })

  test('"Zu tun" in der Übersicht listet das Offene und springt in den Reiter (Fokus auf den Reiter)', async () => {
    await render()

    const items = [...container.querySelectorAll('.admin-todo-item')]
    expect(items.map((item) => item.textContent.trim())).toEqual([
      '2 offene Anfragen',
      '1 Beitrag wartet auf Freigabe',
      '3 offene Nachrichten'
    ])

    await click(items[1])
    expect(selectedTab().firstChild.textContent).toBe('Freigaben')
    expect(currentSearch).toBe('?tab=freigaben')
    expect(document.activeElement).toBe(tab('Freigaben'))

    await click(tab('Übersicht'))
    await click([...container.querySelectorAll('.admin-todo-item')][2])
    expect(selectedTab().firstChild.textContent).toBe('Nachrichten')
    expect(visiblePanel().querySelector('[data-testid="nachrichten"]')).not.toBeNull()
  })

  test('ist nichts offen, sagt "Zu tun" das - und die Reiter bleiben ohne Zahl', async () => {
    reported.anfragen = 0
    reported.freigaben = 0
    overview.mockResolvedValue({ stats: { ...stats, openMessages: 0 }, families: [] })
    await render()

    expect(container.querySelectorAll('.tab-bar-count')).toHaveLength(0)
    expect(container.querySelector('.admin-todo-item')).toBeNull()
    expect(container.querySelector('.admin-todo').textContent).toContain('Nichts offen – alles ist bearbeitet.')
  })

  test('der Bestand zeigt die Zahlen der Instanz unter eigener Überschrift', async () => {
    await render()

    const inventory = container.querySelector('.admin-inventory')
    expect(inventory.querySelector('h2').textContent).toBe('Bestand')
    expect(inventory.textContent).toContain('3,0 MB')
  })

  test('Abmelden ruft die API und zeigt wieder die Anmeldung', async () => {
    await render()

    await click([...container.querySelectorAll('.admin-header button')].find((el) => el.textContent.includes('Abmelden')))
    expect(logout).toHaveBeenCalled()
    expect(container.querySelector('.admin-login')).not.toBeNull()
  })
})

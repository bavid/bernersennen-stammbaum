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
vi.mock('../components/AdminStats.jsx', () => ({ default: ({ teil }) => <p data-testid={`stats-${teil}`}>Kennzahlen</p> }))
vi.mock('../components/AdminKpi.jsx', () => ({ default: () => <p data-testid="erfolg">Erfolg messen</p> }))
vi.mock('../components/AdminVouchers.jsx', () => ({ default: () => <p data-testid="gutscheine">Gutschein-Karte</p> }))
vi.mock('../components/AdminPartners.jsx', () => ({ default: () => <p data-testid="partner">Partner-Karte</p> }))
vi.mock('../components/AdminPromotions.jsx', () => ({ default: () => <p data-testid="empfehlungen">Empfehlungen-Karte</p> }))
vi.mock('../components/AdminCommunityBanner.jsx', () => ({ default: () => <p data-testid="band">Band-Karte</p> }))
vi.mock('../components/AdminSupport.jsx', () => ({ default: () => <p data-testid="spenden">Spenden-Karte</p> }))
vi.mock('../components/AdminLandeadressen.jsx', () => ({ default: () => <p data-testid="landeadressen">Landeadressen-Karte</p> }))
vi.mock('../components/AdminFamilyList.jsx', () => ({ default: () => <p data-testid="familien">Familien-Karte</p> }))
vi.mock('../components/AdminMessages.jsx', () => ({ default: () => <p data-testid="nachrichten">Nachrichten-Karte</p> }))
vi.mock('../components/AdminNotify.jsx', () => ({ default: () => <p data-testid="telegram">Telegram-Karte</p> }))
vi.mock('../components/AdminEinladungskarte.jsx', () => ({ default: () => <p data-testid="einladungskarte">Einladungskarte-Karte</p> }))
vi.mock('../components/AdminHinweise.jsx', () => ({ default: () => <p data-testid="hinweise">Hinweise-Karte</p> }))
vi.mock('../components/AdminServer.jsx', () => ({ default: () => <p data-testid="server">Server-Karte</p> }))
vi.mock('../components/AdminLog.jsx', () => ({ default: () => <p data-testid="protokoll">Protokoll-Karte</p> }))
vi.mock('../components/AdminFinanzierung.jsx', () => ({ default: () => <p data-testid="finanzierung">Finanzierung-Karte</p> }))

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

function mainTabs() {
  return [...container.querySelectorAll('.admin-tabs [role="tab"]')]
}

// Die Unterreiter des sichtbaren Hauptreiters.
function subTabs() {
  return [...container.querySelectorAll('.admin-section:not([hidden]) .admin-subtabs [role="tab"]')]
}

function label(el) {
  return el.firstChild.textContent
}

function tab(text) {
  return mainTabs().find((el) => label(el) === text)
}

function subTab(text) {
  return subTabs().find((el) => label(el) === text)
}

function selected(list) {
  return list.find((el) => el.getAttribute('aria-selected') === 'true')
}

// Das sichtbare Unter-Panel im sichtbaren Hauptreiter.
function visiblePanel() {
  return [...container.querySelectorAll('.admin-section:not([hidden]) .admin-subpanel')].find((panel) => !panel.hidden)
}

async function click(element) {
  await act(async () => element.click())
}

async function press(key) {
  await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
}

async function rerender(path) {
  act(() => root.unmount())
  container.remove()
  await render(path)
}

describe('AdminPage – 5 Reiter mit Unterreitern', () => {
  test('Kopf mit Titel "Admin", Präsentation, Bausteine und Abmelden; fünf Hauptreiter in einer echten Tabliste', async () => {
    await render()

    expect(container.querySelector('.admin-header h1').textContent).toBe('Admin')
    const links = [...container.querySelectorAll('.admin-header-actions a, .admin-header-actions button')].map((el) => el.textContent.trim())
    expect(links).toEqual(['Präsentation', 'Bausteine', 'Abmelden'])
    expect(container.querySelector('.admin-tabs').getAttribute('aria-label')).toBe('Admin-Bereiche')
    expect(mainTabs().map(label)).toEqual(['Übersicht', 'Familien & Partner', 'Inhalte & Freigaben', 'Werbung & Messen', 'System'])
    expect(label(selected(mainTabs()))).toBe('Übersicht')
    expect(selected(mainTabs()).getAttribute('tabindex')).toBe('0')
    expect(tab('System').getAttribute('tabindex')).toBe('-1')
    expect(subTabs().map(label)).toEqual(['Auf einen Blick', 'Erfolg messen'])
  })

  test('jeder Hauptreiter hat seine Unterreiter - kein Unterreiter doppelt', async () => {
    await render()
    const tree = {}
    for (const main of mainTabs()) {
      await click(main)
      tree[label(main)] = subTabs().map(label)
    }
    expect(tree).toEqual({
      Übersicht: ['Auf einen Blick', 'Erfolg messen'],
      'Familien & Partner': ['Familien', 'Partner', 'Anfragen', 'Einladungscodes', 'Einladungskarte'],
      'Inhalte & Freigaben': ['Freigaben', 'Nachrichten', 'Hinweise', 'Öffentliche Profile'],
      'Werbung & Messen': ['Empfehlungen', 'Band „Mit dabei“', 'Landeadressen', 'Statistik', 'Spenden', 'Finanzierung'],
      System: ['Server', 'Benachrichtigungen', 'Protokoll']
    })
  })

  test('Zähler: Hauptreiter mit der Summe, Unterreiter einzeln - vorgelesen als "n offen"', async () => {
    await render()

    const count = (el) => el.querySelector('.tab-bar-count')?.textContent
    expect(count(tab('Familien & Partner'))).toBe('2')
    expect(count(tab('Inhalte & Freigaben'))).toBe('4')
    expect(count(tab('System'))).toBeUndefined()
    expect(tab('Familien & Partner').textContent).toBe('Familien & Partner2 (2 offen)')

    await click(tab('Inhalte & Freigaben'))
    expect(count(subTab('Freigaben'))).toBe('1')
    expect(count(subTab('Nachrichten'))).toBe('3')
    expect(count(subTab('Hinweise'))).toBeUndefined()
  })

  test('Haupt- und Unterreiter steuern ihre Panels; nur eines ist sichtbar', async () => {
    await render()

    for (const el of [...mainTabs(), ...container.querySelectorAll('.admin-subtabs [role="tab"]')]) {
      const panel = document.getElementById(el.getAttribute('aria-controls'))
      expect(panel.getAttribute('role')).toBe('tabpanel')
      expect(panel.getAttribute('aria-labelledby')).toBe(el.id)
    }
    expect(visiblePanel().id).toBe('admin-bereich-ueberblick')
    expect(visiblePanel().querySelector('[data-testid="stats-kennzahlen"]')).not.toBeNull()
    expect(visiblePanel().querySelector('[data-testid="erfolg"]')).toBeNull()
  })

  test('Klicks schreiben Haupt- und Unterreiter in die Adresse; Übersicht › Auf einen Blick ohne Parameter', async () => {
    await render()

    await click(tab('Werbung & Messen'))
    expect(currentSearch).toBe('?tab=werbung&bereich=empfehlungen')
    expect(visiblePanel().querySelector('[data-testid="empfehlungen"]')).not.toBeNull()
    expect(visiblePanel().querySelector('[data-testid="band"]')).toBeNull()

    await click(subTab('Band „Mit dabei“'))
    expect(currentSearch).toBe('?tab=werbung&bereich=band')
    expect(visiblePanel().querySelector('[data-testid="band"]')).not.toBeNull()

    await click(subTab('Statistik'))
    expect(visiblePanel().querySelector('[data-testid="stats-details"]')).not.toBeNull()

    await click(tab('Übersicht'))
    expect(currentSearch).toBe('')
    await click(subTab('Erfolg messen'))
    expect(currentSearch).toBe('?tab=uebersicht&bereich=erfolg')
    expect(visiblePanel().querySelector('[data-testid="erfolg"]')).not.toBeNull()
  })

  test('zurück im Hauptreiter steht wieder der zuletzt gewählte Unterreiter', async () => {
    await render()

    await click(tab('System'))
    await click(subTab('Protokoll'))
    await click(tab('Übersicht'))
    await click(tab('System'))
    expect(currentSearch).toBe('?tab=system&bereich=protokoll')
    expect(label(selected(subTabs()))).toBe('Protokoll')
  })

  test('?tab=&bereich= aus der Adresse; fremder Bereich → erster Unterreiter, Unbekanntes → Übersicht', async () => {
    await render('/admin?tab=system&bereich=benachrichtigungen')
    expect(label(selected(mainTabs()))).toBe('System')
    expect(label(selected(subTabs()))).toBe('Benachrichtigungen')
    expect(visiblePanel().querySelector('[data-testid="telegram"]')).not.toBeNull()

    await rerender('/admin?tab=system&bereich=band')
    expect(label(selected(subTabs()))).toBe('Server')

    await rerender('/admin?tab=gibtesnicht')
    expect(label(selected(mainTabs()))).toBe('Übersicht')
    expect(label(selected(subTabs()))).toBe('Auf einen Blick')
  })

  test.each([
    ['gutscheine', 'Familien & Partner', 'Einladungscodes', 'gutscheine'],
    ['empfehlungen', 'Werbung & Messen', 'Empfehlungen', 'empfehlungen'],
    ['einstellungen', 'System', 'Benachrichtigungen', 'telegram'],
    ['finanzierung', 'Werbung & Messen', 'Finanzierung', 'finanzierung'],
    ['hinweise', 'Inhalte & Freigaben', 'Hinweise', 'hinweise'],
    ['protokoll', 'System', 'Protokoll', 'protokoll']
  ])('alter Link ?tab=%s öffnet %s › %s', async (old, main, sub, testId) => {
    await render(`/admin?tab=${old}`)
    expect(label(selected(mainTabs()))).toBe(main)
    expect(label(selected(subTabs()))).toBe(sub)
    expect(visiblePanel().querySelector(`[data-testid="${testId}"]`)).not.toBeNull()
  })

  test('Karten laden erst beim ersten Öffnen und bleiben danach eingehängt; Anfragen und Freigaben sofort', async () => {
    await render()

    expect(container.querySelector('[data-testid="anfragen"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="freigaben"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="gutscheine"]')).toBeNull()

    await click(tab('Familien & Partner'))
    await click(subTab('Einladungscodes'))
    await click(subTab('Partner'))
    expect(container.querySelector('[data-testid="gutscheine"]')).not.toBeNull()
    expect(document.getElementById('admin-bereich-gutscheine').hidden).toBe(true)
  })

  test('Einladungskarte steht unter Familien & Partner, Telegram allein unter System › Benachrichtigungen', async () => {
    await render('/admin?tab=familien-partner&bereich=einladungskarte')
    expect(visiblePanel().querySelector('[data-testid="einladungskarte"]')).not.toBeNull()

    await click(tab('System'))
    await click(subTab('Benachrichtigungen'))
    expect(visiblePanel().querySelector('[data-testid="telegram"]')).not.toBeNull()
    expect(visiblePanel().querySelector('[data-testid="einladungskarte"]')).toBeNull()
  })

  test('Pfeiltasten, Pos1 und Ende wechseln Haupt- und Unterreiter samt Fokus', async () => {
    await render()
    act(() => tab('Übersicht').focus())

    await press('ArrowRight')
    expect(label(selected(mainTabs()))).toBe('Familien & Partner')
    expect(document.activeElement).toBe(tab('Familien & Partner'))
    expect(currentSearch).toBe('?tab=familien-partner&bereich=familien')

    await press('End')
    expect(label(selected(mainTabs()))).toBe('System')
    await press('ArrowRight')
    expect(label(selected(mainTabs()))).toBe('Übersicht')

    await click(tab('Werbung & Messen'))
    act(() => subTab('Empfehlungen').focus())
    await press('End')
    expect(label(selected(subTabs()))).toBe('Finanzierung')
    expect(document.activeElement).toBe(subTab('Finanzierung'))
    await press('ArrowLeft')
    expect(currentSearch).toBe('?tab=werbung&bereich=spenden')
  })

  test('"Zu tun" in der Übersicht listet das Offene und springt in den Unterreiter (Fokus darauf)', async () => {
    await render()

    const items = [...container.querySelectorAll('.admin-todo-item')]
    expect(items.map((item) => item.textContent.trim())).toEqual([
      '2 offene Anfragen',
      '1 Beitrag wartet auf Freigabe',
      '3 offene Nachrichten'
    ])

    await click(items[1])
    expect(label(selected(mainTabs()))).toBe('Inhalte & Freigaben')
    expect(currentSearch).toBe('?tab=inhalte&bereich=freigaben')
    expect(document.activeElement).toBe(subTab('Freigaben'))

    await click(tab('Übersicht'))
    await click([...container.querySelectorAll('.admin-todo-item')][0])
    expect(currentSearch).toBe('?tab=familien-partner&bereich=anfragen')
    expect(visiblePanel().querySelector('[data-testid="anfragen"]')).not.toBeNull()
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

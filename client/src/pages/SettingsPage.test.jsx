// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  setDarstellung: vi.fn(),
  listDogs: vi.fn(),
  leaveFamily: vi.fn(),
  view: vi.fn(),
  setDogShares: vi.fn(),
  // Einstellungen › Wer sieht was
  sichtbarkeitUebersicht: vi.fn(),
  listTimeline: vi.fn(),
  visits: vi.fn(),
  endVisit: vi.fn(),
  removeGuest: vi.fn(),
  renameFamily: vi.fn(),
  updateFamily: vi.fn(),
  familyMembers: vi.fn(),
  // Mein Zuhause zeigt auch die Rahmen-Links des digitalen Bilderrahmens (eigener Abschnitt)
  rahmenGeraete: vi.fn(),
  // Einstellungen › App: Benachrichtigungen aufs Handy fragen den Server nach dem Schlüssel
  pushKey: vi.fn()
}))
vi.mock('../api', () => ({ api }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../components/Toast.jsx', () => ({ useToast: () => toast }))

import SettingsPage from './SettingsPage.jsx'
import { DemoProvider } from '../lib/demo.js'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom kennt <dialog> nicht ganz (JoinFamilyDialog öffnet ein Modal).
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
  }
}

const home = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' }
const memberships = [
  { id: 3, name: 'Familie Sonnenhang', theme: 'standard', rolle: 'leitung', tiere: 21, eigeneTiere: 1 },
  { id: 4, name: 'Familie Talgrund', theme: 'standard', rolle: 'gast', tiere: 6, eigeneTiere: 0 }
]
const atHome = {
  ...home,
  isDemo: false,
  role: 'leitung',
  home,
  memberships,
  besuche: [],
  darstellung: { palette: 'familienalbum', modus: 'auto', schrift: 'normal', akzent: '', schriftart: 'klassisch', handschrift: 'an', ecken: 'weich' }
}
const inGroup = { ...atHome, id: 3, name: 'Familie Sonnenhang', art: 'rudel' }
const dogs = [
  { id: 11, name: 'Nele', family_id: 1, can_edit: 1, shares: [3] },
  { id: 12, name: 'Flocke', family_id: 1, can_edit: 1, shares: [] }
]

let container
let root
let latest
let location
const onInvite = vi.fn()

function Probe() {
  location = useLocation()
  return null
}

let setFamilyFromOutside

// Wie App.jsx: hält "me" und rendert die Seite nur mit Sitzung (ein 401 setzt sie dort auf null).
function Harness({ initial }) {
  const [family, setFamily] = useState(initial)
  latest = family
  setFamilyFromOutside = setFamily
  return (
    <ThemeProvider themeId="standard">
      <DemoProvider value={family}>
        {family && <SettingsPage family={family} onFamilyChange={setFamily} onInvite={onInvite} />}
        <Probe />
      </DemoProvider>
    </ThemeProvider>
  )
}

async function render(initial, path = '/einstellungen') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Harness initial={initial} />
      </MemoryRouter>
    )
  )
}

const tabs = () => [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)
const selectedTab = () => container.querySelector('[role="tab"][aria-selected="true"]')?.textContent
const radio = (name, value) => container.querySelector(`input[name="${name}"][value="${value}"]`)
const buttonText = (text) => [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === text)
const flush = () => act(async () => {})

beforeEach(() => {
  api.rahmenGeraete.mockResolvedValue({ geraete: [], max: 5 })
  api.listDogs.mockResolvedValue(dogs)
  api.sichtbarkeitUebersicht.mockResolvedValue({ tiere: [] })
  api.listTimeline.mockResolvedValue([])
  api.visits.mockResolvedValue({ besuche: [{ id: 9, name: 'Zuhause Möwenweg', seit: '2026-09-01 10:00:00' }], gaeste: [] })
  api.setDarstellung.mockImplementation(async (patch) => ({ ...atHome.darstellung, ...patch }))
  api.pushKey.mockResolvedValue({ enabled: false, publicKey: null, geraete: 0 })
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  for (const fn of Object.values(api)) fn.mockReset()
  toast.mockReset()
  onInvite.mockReset()
})

describe('SettingsPage – Bereiche und Adresse (?bereich=)', () => {
  test('ohne Angabe die Darstellung; fünf Reiter für Haushalte', async () => {
    await render(atHome)
    expect(tabs()).toEqual(['Darstellung', 'Familien', 'Mein Zuhause', 'Wer sieht was', 'App'])
    expect(selectedTab()).toBe('Darstellung')
    expect(container.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby')).toBe('einstellungen-darstellung')
    expect(container.querySelector('legend').textContent).toBe('Farbwelt')
  })

  test('?bereich=familien öffnet die Familien, ein Reiter schreibt die Adresse, Unbekanntes fällt auf die Darstellung', async () => {
    await render(atHome, '/einstellungen?bereich=familien')
    expect(selectedTab()).toBe('Familien')

    await act(async () => container.querySelector('#einstellungen-zuhause').click())
    expect(location.search).toBe('?bereich=zuhause')
    expect(selectedTab()).toBe('Mein Zuhause')
    await act(async () => container.querySelector('#einstellungen-darstellung').click())
    expect(location.search).toBe('')

    act(() => root.unmount())
    container.remove()
    await render(atHome, '/einstellungen?bereich=quatsch')
    expect(selectedTab()).toBe('Darstellung')
  })

  test('ein klassisches Rudel-Login: Darstellung und "Familie" - dort gleich „Familie verwalten“ für die eine Familie', async () => {
    const rudel = { id: 5, name: 'Rudel Talblick', theme: 'berner', art: 'rudel', isDemo: false, role: 'leitung', home: { id: 5, art: 'rudel' }, memberships: [] }
    api.familyMembers.mockResolvedValue({ familyId: 5, name: 'Rudel Talblick', ichBin: 'leitung', mitglieder: [] })
    await render(rudel, '/einstellungen?bereich=familien')
    await flush()
    expect(tabs()).toEqual(['Darstellung', 'Familie', 'App'])
    expect(selectedTab()).toBe('Familie')
    expect(container.querySelector('.family-manage-title').textContent).toContain('Rudel Talblick')
    expect(container.querySelector('.family-manage .back-link')).toBeNull()
  })

  test('?bereich=app: „Als App aufs Handy“ mit dem Install-Hinweis in der bleibenden Fassung', async () => {
    await render(atHome, '/einstellungen?bereich=app')
    expect(selectedTab()).toBe('App')
    expect(container.querySelector('.install-hint-settings h3').textContent).toContain('Als App aufs Handy')
    expect(container.querySelector('.install-hint-later')).toBeNull()
  })
})

describe('SettingsPage – Darstellung', () => {
  test('fünf Farbwelten mit Farbmuster; eine Wahl wirkt sofort und wird für das Zuhause gespeichert', async () => {
    await render(atHome)
    expect([...container.querySelectorAll('input[name="palette"]')].map((input) => input.value)).toEqual([
      'familienalbum',
      'wald',
      'meer',
      'lavendel',
      'schiefer'
    ])
    expect(container.querySelector('.palette-swatch[data-palette="wald"]')).not.toBeNull()
    expect(radio('palette', 'familienalbum').checked).toBe(true)

    await act(async () => radio('palette', 'wald').click())
    expect(latest.darstellung).toEqual({ ...atHome.darstellung, palette: 'wald' })
    expect(api.setDarstellung).toHaveBeenCalledWith({ palette: 'wald' })
    expect(radio('palette', 'wald').checked).toBe(true)

    await act(async () => radio('modus', 'dunkel').click())
    await act(async () => radio('schrift', 'gross').click())
    expect(api.setDarstellung).toHaveBeenLastCalledWith({ schrift: 'gross' })
    expect(latest.darstellung).toEqual({ ...atHome.darstellung, palette: 'wald', modus: 'dunkel', schrift: 'gross' })
    expect(container.querySelector('.settings-hint').textContent).toContain('auf jedem Gerät')
  })

  test('Demo: wirkt nur für diesen Besuch - kein Speichern, kein Fehler', async () => {
    await render({ ...atHome, isDemo: true })
    expect(container.querySelector('.settings-hint').textContent).toBe('In der Demo nur für diesen Besuch – gespeichert wird nichts.')
    await act(async () => radio('palette', 'meer').click())
    expect(latest.darstellung.palette).toBe('meer')
    expect(api.setDarstellung).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  test('zwei gescheiterte Wahlen hintereinander: zurück auf den zuletzt bestätigten Wert, der Reihe nach gespeichert', async () => {
    const order = []
    api.setDarstellung.mockImplementation(async (patch) => {
      order.push(patch.palette)
      throw new Error('Server nicht erreichbar')
    })
    await render(atHome)
    await act(async () => radio('palette', 'wald').click())
    await act(async () => radio('palette', 'meer').click())
    await flush()
    await flush()
    expect(order).toEqual(['wald', 'meer'])
    expect(latest.darstellung.palette).toBe('familienalbum')
  })

  test('ein 401 beim Speichern (App meldet ab) lässt die Seite nicht abstürzen', async () => {
    api.setDarstellung.mockImplementation(async () => {
      setFamilyFromOutside(null)
      throw new Error('Sitzung abgelaufen – bitte neu anmelden')
    })
    await render(atHome)
    await act(async () => radio('palette', 'schiefer').click())
    await flush()
    expect(latest).toBeNull()
    expect(container.querySelector('.settings-page')).toBeNull()
  })

  test('scheitert das Speichern, geht die Wahl zurück und ein Hinweis erklärt es', async () => {
    api.setDarstellung.mockRejectedValue(new Error('Server nicht erreichbar'))
    await render(atHome)
    await act(async () => radio('palette', 'lavendel').click())
    await flush()
    expect(latest.darstellung.palette).toBe('familienalbum')
    expect(toast).toHaveBeenCalledWith('Server nicht erreichbar')
  })
})

describe('SettingsPage – Familien', () => {
  // Phase W: "Öffnen" führt zur Gruppenseite - den Wechsel macht dort das AreaGate.
  test('Familien mit Rolle und derselben Zählung wie überall ("21 Tiere · davon 1 von euch"); Öffnen führt zur Gruppenseite', async () => {
    await render(atHome, '/einstellungen?bereich=familien')
    await flush()
    const rows = [...container.querySelectorAll('.settings-list')[0].querySelectorAll('.settings-row')]
    expect(rows.map((row) => row.querySelector('strong').textContent)).toEqual(['Familie Sonnenhang', 'Familie Talgrund'])
    expect(rows[0].querySelector('.settings-row-sub').textContent).toBe('Familienleitung · 21 Tiere · davon 1 von euch')
    expect(rows[1].querySelector('.settings-row-sub').textContent).toBe('Gast · 6 Tiere')

    await act(async () => rows[0].querySelector('button').click())
    expect(location.pathname).toBe('/familien/3')
    expect(api.view).not.toHaveBeenCalled()
  })

  // Phase W, Schritt 2: Verlassen, Leitung übergeben und Auflösen stehen in Einstellungen › Familien › [Familie].
  test('jede Familie mit "Verwalten" - der Link nennt die Familie in der Adresse, kein Verlassen mehr in der Liste', async () => {
    await render(atHome, '/einstellungen?bereich=familien')
    await flush()
    const manage = (name) => container.querySelector(`a[aria-label="${name} verwalten"]`)
    expect(manage('Familie Sonnenhang').getAttribute('href')).toBe('/einstellungen?bereich=familien&familie=3')
    expect(manage('Familie Talgrund').getAttribute('href')).toBe('/einstellungen?bereich=familien&familie=4')
    expect(container.querySelector('button[aria-label$="verlassen"]')).toBeNull()
  })

  test('?familie=<aktive Familie>: „Familie verwalten“ statt der Liste; ein Reiter führt wieder ohne Familie weiter', async () => {
    api.familyMembers.mockResolvedValue({ familyId: 3, name: 'Familie Sonnenhang', ichBin: 'leitung', mitglieder: [] })
    await render(inGroup, '/einstellungen?bereich=familien&familie=3')
    await flush()
    expect(container.querySelector('.family-manage-title').textContent).toContain('Familie Sonnenhang')
    expect(container.querySelector('.family-manage .back-link').getAttribute('href')).toBe('/einstellungen?bereich=familien')
    expect(container.querySelector('.share-card')).toBeNull()

    await act(async () => [...container.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'Mein Zuhause').click())
    expect(location.search).toBe('?bereich=zuhause')
  })

  test('?familie= einer anderen als der aktiven Familie zeigt die Liste (das Gate der Route hat nicht gewechselt)', async () => {
    await render(atHome, '/einstellungen?bereich=familien&familie=3')
    await flush()
    expect(container.querySelector('.family-manage')).toBeNull()
    expect(container.querySelector('a[aria-label="Familie Sonnenhang verwalten"]')).not.toBeNull()
  })

  // Phase W, Schritt 2 (Betreiber: die Kästchen je Tier verstand niemand): je Familie eine Karte mit einem Schalter je Tier.
  test('Familien zeigt statt eigener Schalter den Weg zu „Wer sieht was“', async () => {
    await render(atHome, '/einstellungen?bereich=familien')
    await flush()
    expect(container.querySelector('.share-card')).toBeNull()
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Wer sieht was')
    expect(link.getAttribute('href')).toBe('/einstellungen?bereich=sichtbarkeit&ansicht=verbindungen')
  })

  test('Wer sieht was › Familien & Gäste: je Familie „In … zeigt ihr:“ mit Schaltern je Tier und dem Satz der Tierseite; als Gast nichts Neues', async () => {
    api.setDogShares.mockResolvedValue({ shares: [3] })
    await render(atHome, '/einstellungen?bereich=sichtbarkeit&ansicht=verbindungen')
    await flush()
    const cards = [...container.querySelectorAll('.share-card')]
    expect(cards.map((card) => card.querySelector('h3').textContent)).toEqual(['In Familie Sonnenhang zeigt ihr:', 'In Familie Talgrund zeigt ihr:'])
    const switchFor = (card, name) =>
      [...card.querySelectorAll('.share-switch')].find((label) => label.querySelector('.share-switch-label').textContent === name).querySelector('input')
    expect(switchFor(cards[0], 'Nele').checked).toBe(true)
    expect(switchFor(cards[0], 'Flocke').checked).toBe(false)
    expect(switchFor(cards[0], 'Flocke').getAttribute('role')).toBe('switch')
    expect(switchFor(cards[1], 'Flocke').disabled).toBe(true)
    expect(container.querySelector('.share-note').textContent).toBe(
      'Ausgewählte Tiere und ihre nicht privaten Erinnerungen sieht die ganze Familie. Private Erinnerungen bleiben immer bei euch.'
    )

    await act(async () => switchFor(cards[0], 'Flocke').click())
    await flush()
    expect(api.setDogShares).toHaveBeenCalledWith(12, [3])
    // Die Zahl an der Familie zieht mit.
    expect(latest.memberships[0]).toMatchObject({ tiere: 22, eigeneTiere: 2 })
  })

  test('Familien: beitreten oder gründen; die befreundeten Zuhause stehen jetzt unter „Mein Zuhause“', async () => {
    await render(atHome, '/einstellungen?bereich=familien')
    await flush()
    expect(container.querySelector('.visit-section')).toBeNull()
    expect(buttonText('Familie beitreten oder gründen')).not.toBeUndefined()
  })

  test('Demo: Freigaben gesperrt mit Hinweis', async () => {
    await render({ ...atHome, isDemo: true }, '/einstellungen?bereich=sichtbarkeit&ansicht=verbindungen')
    await flush()
    expect(container.querySelector('.share-card input[role="switch"]').disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
  })
})

describe('SettingsPage – Mein Zuhause', () => {
  test('Umbenennen erst auf Klick; der neue Name zieht auch in home mit', async () => {
    api.renameFamily.mockResolvedValue({ id: 1, name: 'Zuhause an der Förde', theme: 'standard' })
    await render(atHome, '/einstellungen?bereich=zuhause')
    expect(container.querySelector('#family-rename')).toBeNull()
    await act(async () => buttonText('Umbenennen').click())
    const input = container.querySelector('#family-rename')
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    act(() => {
      setValue.call(input, 'Zuhause an der Förde')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const form = input.closest('form')
    await act(async () => form.requestSubmit())
    await act(async () => form.requestSubmit())
    expect(api.renameFamily).toHaveBeenCalledWith('Zuhause an der Förde')
    expect(latest.name).toBe('Zuhause an der Förde')
    expect(latest.home.name).toBe('Zuhause an der Förde')
    expect(latest.darstellung).toEqual(atHome.darstellung)
  })

  test('befreundete Zuhause (Phase W, Schritt 2): nur die Listen - Einladen im Dialog, Einlösen unter „Familien“', async () => {
    await render(atHome, '/einstellungen?bereich=zuhause')
    await flush()
    expect(container.querySelector('#settings-besuche-title').textContent).toBe('Befreundete Zuhause')
    expect(container.querySelector('.visit-section.is-lists-only')).not.toBeNull()
    expect(container.textContent).toContain('Zuhause Möwenweg')
    expect(container.querySelector('#visit-invite-title')).toBeNull()
    expect(container.querySelector('#visit-redeem-code')).toBeNull()
  })

  test('Einladungen öffnen den Einladen-Dialog; Schlüssel und Benutzer erst auf Klick', async () => {
    await render(atHome, '/einstellungen?bereich=zuhause')
    await act(async () => buttonText('Einladen').click())
    expect(onInvite).toHaveBeenCalledTimes(1)
    const access = buttonText('Schlüssel und Benutzer verwalten')
    expect(access.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('#settings-zugang-panel').hidden).toBe(true)
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { me, view, listDogs, listAllDogs, recentActivity, listNotes, listLinks } = vi.hoisted(() => ({
  me: vi.fn(),
  view: vi.fn(),
  listDogs: vi.fn(),
  listAllDogs: vi.fn(),
  recentActivity: vi.fn(),
  listNotes: vi.fn(),
  listLinks: vi.fn()
}))

vi.mock('./api', () => ({
  api: { me, view, listDogs, listAllDogs, recentActivity, listNotes, listLinks },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const groupA = { id: 2, name: 'Familie Sonnenhang', theme: 'standard' }
const groupB = { id: 3, name: 'Familie Nachbarn', theme: 'standard' }
const home = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' }

const meInGroupA = { ...groupA, art: 'rudel', isDemo: false, role: 'mitglied', home, memberships: [groupA, groupB] }
const meInGroupB = { ...groupB, art: 'rudel', isDemo: false, role: 'mitglied', home, memberships: [groupA, groupB] }
const meAtHome = { ...home, isDemo: false, role: 'leitung', home, memberships: [groupA, groupB] }

async function render(initialEntry = '/start') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    )
  )
  return container
}

beforeEach(() => {
  listDogs.mockResolvedValue([])
  listAllDogs.mockResolvedValue([])
  recentActivity.mockResolvedValue([])
  listNotes.mockResolvedValue([])
  listLinks.mockResolvedValue([])
})

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
  me.mockReset()
  view.mockReset()
  listDogs.mockReset()
  listAllDogs.mockReset()
  recentActivity.mockReset()
  listNotes.mockReset()
  listLinks.mockReset()
})

const mainHeading = () => container.querySelector('main h1')?.textContent

// Phase W: kein Bereichswechsler mehr - das AreaGate einer Route wechselt selbst (api.view), <main key={family.id}> mountet
// die Seite im neuen Bereich neu und lädt ihre Daten neu.
describe('AreaGate in der App: Wechsel beim Navigieren', () => {
  test('die Gruppenseite einer anderen Familie wechselt dorthin und lädt deren Tiere', async () => {
    me.mockResolvedValue(meInGroupA)
    view.mockResolvedValue(meInGroupB)
    await render('/familien/3')

    expect(view).toHaveBeenCalledTimes(1)
    expect(view).toHaveBeenCalledWith(3)
    expect(mainHeading()).toBe('Familie Nachbarn')
    expect(listDogs).toHaveBeenCalledTimes(1)
  })

  test('"Start" aus einer Familie heraus wechselt ins eigene Zuhause und lädt dort neu', async () => {
    me.mockResolvedValue(meInGroupA)
    view.mockResolvedValue(meAtHome)
    await render('/familien/2')
    expect(mainHeading()).toBe('Familie Sonnenhang')
    expect(listDogs).toHaveBeenCalledTimes(1)

    const start = [...container.querySelectorAll('.app-nav a')].find((a) => a.textContent === 'Start')
    await act(async () => start.click())

    expect(view).toHaveBeenCalledWith(1)
    expect(mainHeading()).toBe('Start – Mein Zuhause')
    expect(listDogs).toHaveBeenCalledTimes(2)
  })

  test('scheitert der Wechsel, geht es zur Familien-Liste - ohne zweiten Versuch', async () => {
    me.mockResolvedValue(meAtHome)
    view.mockRejectedValue(new Error('Diesen Bereich gibt es nicht'))
    await render('/familien/77')

    expect(view).toHaveBeenCalledTimes(1)
    expect(mainHeading()).toBe('Familien')
  })
})

describe('/wegbegleiter (alte Adresse)', () => {
  test('aus einer Familie heraus: Reiter "Zeitleiste" der Tiere im eigenen Zuhause', async () => {
    me.mockResolvedValue(meInGroupA)
    view.mockResolvedValue(meAtHome)
    await render('/wegbegleiter')

    expect(view).toHaveBeenCalledWith(1)
    expect(mainHeading()).toBe('Tiere')
    expect(container.querySelector('.animals-tab-bar [aria-selected="true"]').textContent).toBe('Zeitleiste')
  })

  test('im eigenen Zuhause ohne Wechsel', async () => {
    me.mockResolvedValue(meAtHome)
    await render('/wegbegleiter')

    expect(view).not.toHaveBeenCalled()
    expect(mainHeading()).toBe('Tiere')
  })
})

describe('Besuch und eigene Adresse (Phase W)', () => {
  const visiting = { id: 9, name: 'Zuhause Möwenweg', theme: 'standard', art: 'zuhause', zuBesuch: true, role: 'gast', isDemo: false, home, memberships: [] }

  test('zu Besuch führt jede andere Adresse über das Gate nach Hause', async () => {
    me.mockResolvedValue(visiting)
    view.mockResolvedValue(meAtHome)
    await render('/start')

    expect(view).toHaveBeenCalledWith(1)
    expect(mainHeading()).toBe('Start – Mein Zuhause')
  })

  test('zu Besuch bleibt die Gruppenseite des besuchten Zuhauses ohne Wechsel', async () => {
    me.mockResolvedValue(visiting)
    await render('/familien/9')

    expect(view).not.toHaveBeenCalled()
    expect(mainHeading()).toBe('Zuhause Möwenweg')
  })

  test('/familien/<eigenes Zuhause> führt zur Familien-Liste', async () => {
    me.mockResolvedValue(meAtHome)
    await render('/familien/1')

    expect(view).not.toHaveBeenCalled()
    expect(mainHeading()).toBe('Familien')
  })
})

// code-review W1 (H1): ein Wechsel per Klick läuft genau einmal über das AreaGate - kein Hin und Her der Sitzung.
describe('genau ein api.view je Wechsel', () => {
  const visiting = { id: 9, name: 'Zuhause Möwenweg', theme: 'standard', art: 'zuhause', zuBesuch: true, role: 'gast', isDemo: false, home, memberships: [] }

  test('"Zurück" im Besuchsband', async () => {
    me.mockResolvedValue(visiting)
    view.mockResolvedValue(meAtHome)
    await render('/familien/9')
    const back = container.querySelector('.visit-banner-back')
    await act(async () => back.click())
    expect(view.mock.calls).toEqual([[1]])
    expect(mainHeading()).toBe('Start – Mein Zuhause')
  })

  test('eine Familie aus "Meine Familien" auf Start öffnen', async () => {
    me.mockResolvedValue(meAtHome)
    view.mockResolvedValue(meInGroupA)
    await render('/start')
    const link = [...container.querySelectorAll('.start-families a')].find((a) => a.textContent.includes('Familie Sonnenhang'))
    await act(async () => link.click())
    expect(view.mock.calls).toEqual([[2]])
    expect(mainHeading()).toBe('Familie Sonnenhang')
  })
})

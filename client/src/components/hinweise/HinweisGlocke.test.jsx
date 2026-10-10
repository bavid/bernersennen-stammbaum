// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  erlebtMitOffen: vi.fn(),
  visits: vi.fn(),
  hinweisGruesse: vi.fn(),
  hinweiseGelesen: vi.fn(),
  confirmErlebtMit: vi.fn(),
  rejectErlebtMit: vi.fn(),
  rejectAllErlebtMitFrom: vi.fn(),
  acknowledgeGuest: vi.fn(),
  removeGuest: vi.fn(),
  wwhKontaktOffen: vi.fn(),
  wwhKontaktAnnehmen: vi.fn(),
  wwhKontaktAblehnen: vi.fn()
}))
vi.mock('../../api', () => ({ api }))

import HinweiseProvider from './HinweiseProvider.jsx'
import HinweisGlocke from './HinweisGlocke.jsx'
import { DemoProvider } from '../../lib/demo.js'
import { REFRESH_MS } from '../../lib/glocke.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let latest
let setFamilyFromTest

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.useRealTimers()
  Object.values(api).forEach((fn) => fn.mockReset())
})

const home = { id: 1, name: 'Zuhause am Deich', art: 'zuhause', home: { id: 1, art: 'zuhause' }, erlebtMitOffen: 1, neueGaeste: 1, neueGruesse: 1 }
const anfrage = {
  requestId: 5,
  angefragtAm: '2026-10-03 10:00:00',
  dogName: 'Wilma',
  titel: 'Strandtag',
  zuhause: 'Zuhause Möwenweg',
  zuhauseId: 8,
  foto_urls: []
}
const gast = { id: 9, name: 'Zuhause Heidekamp', seit: '2026-10-04 08:00:00', neu: true, ueberCode: 'Tante Matilde' }
const kontakt = {
  id: 7,
  tierName: 'Benno',
  eigenesTierName: 'Flocke',
  ortName: 'Hundeschule Bachweg',
  ortSlug: 'hundeschule-bachweg',
  fotoUrl: null,
  createdAt: '2026-10-05 12:00:00'
}
const gruss = { id: 3, entryId: 12, dogId: 4, titel: 'Erster Schnee', von: 'Familie Sonnenhang', createdAt: '2026-10-02 09:00:00', neu: true }

function Harness({ initial, entries }) {
  const [family, setFamily] = useState(initial)
  latest = family
  setFamilyFromTest = setFamily
  return (
    <MemoryRouter initialEntries={entries}>
      <DemoProvider value={family}>
        <HinweiseProvider family={family} onFamilyChange={setFamily}>
          <HinweisGlocke />
        </HinweiseProvider>
      </DemoProvider>
    </MemoryRouter>
  )
}

async function render(family = home, entries = ['/start']) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<Harness initial={family} entries={entries} />))
}

function mockLists({ anfragen = [anfrage], gaeste = [gast], gruesse = [gruss], kontakte = [] } = {}) {
  api.wwhKontaktOffen.mockResolvedValue({ an: kontakte, von: [] })
  api.erlebtMitOffen.mockResolvedValue(anfragen)
  api.visits.mockResolvedValue({ besuche: [], gaeste })
  api.hinweisGruesse.mockResolvedValue({ gruesse, zahlen: { anfragen: anfragen.length, gaeste: gaeste.filter((g) => g.neu).length, gruesse: gruesse.filter((g) => g.neu).length } })
  api.hinweiseGelesen.mockResolvedValue({ zahlen: { anfragen: anfragen.length, gaeste: gaeste.filter((g) => g.neu).length, gruesse: 0 } })
}

const bell = () => container.querySelector('.hinweis-glocke-knopf')
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
const panel = () => container.querySelector('.hinweis-popover')

async function openBell() {
  await act(async () => bell().click())
}

describe('Hinweis-Glocke', () => {
  test('Glocke mit Badge und sprechendem Namen - ohne Anfrage beim Laden', async () => {
    await render()
    expect(bell().getAttribute('aria-label')).toBe('Hinweise, 3 neu')
    expect(bell().getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.hinweis-glocke-badge').textContent).toBe('3')
    expect(api.hinweisGruesse).not.toHaveBeenCalled()
  })

  test('Öffnen: holt die drei Listen, zeigt sie ruhig, Fokus im Fenster, Grüße gelten als gesehen', async () => {
    mockLists()
    await render()
    await openBell()
    expect(bell().getAttribute('aria-expanded')).toBe('true')
    expect(panel().getAttribute('role')).toBe('dialog')
    expect(document.activeElement).toBe(panel())
    const texts = [...container.querySelectorAll('.hinweis-text')].map((el) => el.textContent)
    expect(texts).toEqual([
      'Neu bei euch zu Gast: Zuhause Heidekamp',
      'Wilma war beim „Strandtag“ mit dabei?',
      'Familie Sonnenhang hat euch zu „Erster Schnee“ gegrüßt'
    ])
    expect(container.querySelector('.hinweis-link').getAttribute('href')).toBe('/tier/4#entry-12')
    expect(container.textContent).toContain('über deinen Code „Tante Matilde“')
    expect(api.hinweiseGelesen).toHaveBeenCalledTimes(1)
    expect(latest.neueGruesse).toBe(0)
    expect(bell().getAttribute('aria-label')).toBe('Hinweise, 2 neu')
  })

  test('„Ja“ übernimmt, „Nein“ lehnt ab - die Zahl kommt vom Server', async () => {
    mockLists({ anfragen: [anfrage, { ...anfrage, requestId: 6, zuhauseId: 7, titel: 'Deichrunde' }], gaeste: [], gruesse: [] })
    api.confirmErlebtMit.mockResolvedValue({ id: 5, status: 'bestaetigt', offen: 1 })
    api.rejectErlebtMit.mockResolvedValue({ id: 6, status: 'abgelehnt', offen: 0 })
    await render({ ...home, erlebtMitOffen: 2, neueGaeste: 0, neueGruesse: 0 })
    await openBell()
    const ja = button('Ja')
    ja.focus()
    await act(async () => ja.click())
    expect(api.confirmErlebtMit).toHaveBeenCalledWith(5)
    // Rückmeldung im Fenster (ein Toast läge am Handy unter dem Blatt); der Fokus bleibt im Fenster
    expect(container.querySelector('.hinweis-feedback').textContent).toBe('Steht jetzt auch in Wilmas Chronik')
    expect(container.querySelector('.hinweis-popover').contains(document.activeElement)).toBe(true)
    expect(document.activeElement.textContent).toBe('Ja')
    expect(latest.erlebtMitOffen).toBe(1)
    await act(async () => button('Nein').click())
    expect(api.rejectErlebtMit).toHaveBeenCalledWith(6)
    expect(latest.erlebtMitOffen).toBe(0)
    expect(container.textContent).toContain('Alles erledigt – nichts Neues.')
  })

  test('ein Fehler steht im Fenster; die anderen Hinweise bleiben bedienbar', async () => {
    mockLists({ anfragen: [anfrage], gaeste: [gast], gruesse: [] })
    api.confirmErlebtMit.mockRejectedValue(new Error('Diese Anfrage gibt es nicht'))
    await render({ ...home, neueGruesse: 0 })
    await openBell()
    await act(async () => button('Ja').click())
    expect(container.querySelector('.hinweis-feedback-error').textContent).toBe('Diese Anfrage gibt es nicht')
    expect(container.querySelector('.hinweis-feedback-error').getAttribute('role')).toBe('alert')
    expect(button('Ja').disabled).toBe(false)
    expect(button('Passt').disabled).toBe(false)
  })

  test('zwei Aktionen zugleich: beide Hinweise bleiben gesperrt, bis ihre eigene Antwort da ist', async () => {
    mockLists({ anfragen: [anfrage], gaeste: [gast], gruesse: [] })
    let finishConfirm
    api.confirmErlebtMit.mockReturnValue(new Promise((resolve) => (finishConfirm = resolve)))
    let finishGuest
    api.acknowledgeGuest.mockReturnValue(new Promise((resolve) => (finishGuest = resolve)))
    await render({ ...home, neueGruesse: 0 })
    await openBell()
    await act(async () => button('Ja').click())
    await act(async () => button('Passt').click())
    expect(button('Ja').disabled).toBe(true)
    expect(button('Passt').disabled).toBe(true)
    await act(async () => finishGuest({ ...home, neueGaeste: 0 }))
    expect(button('Ja').disabled).toBe(true)
    await act(async () => finishConfirm({ id: 5, status: 'bestaetigt', offen: 0 }))
    expect(container.textContent).toContain('Alles erledigt – nichts Neues.')
    expect(container.querySelector('.hinweis-popover').contains(document.activeElement)).toBe(true)
  })

  test('am Handy: Blatt von unten (Modal) - die Rückmeldung steht im Blatt', async () => {
    const original = window.matchMedia
    window.matchMedia = (query) => ({ matches: query === '(max-width: 720px)', media: query, addEventListener() {}, removeEventListener() {} })
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal() {
        this.open = true
      }
      HTMLDialogElement.prototype.close = function close() {
        this.open = false
      }
    }
    try {
      mockLists({ anfragen: [], gaeste: [gast], gruesse: [] })
      api.acknowledgeGuest.mockResolvedValue({ ...home, neueGaeste: 0 })
      await render({ ...home, erlebtMitOffen: 0, neueGruesse: 0 })
      await openBell()
      const dialog = container.querySelector('dialog.modal-hinweise')
      expect(dialog.open).toBe(true)
      expect(container.querySelector('.hinweis-popover')).toBeNull()
      await act(async () => button('Passt').click())
      expect(dialog.querySelector('.hinweis-feedback').textContent).toBe('„Zuhause Heidekamp“ ist bei euch willkommen')
    } finally {
      window.matchMedia = original
    }
  })

  test('zwei Anfragen aus einem Zuhause: „Alle 2 von … ablehnen“ (zweistufig)', async () => {
    mockLists({ anfragen: [anfrage, { ...anfrage, requestId: 6 }], gaeste: [], gruesse: [] })
    api.rejectAllErlebtMitFrom.mockResolvedValue({ abgelehnt: 2, offen: 0 })
    await render({ ...home, erlebtMitOffen: 2, neueGaeste: 0, neueGruesse: 0 })
    await openBell()
    act(() => button('Alle 2 von „Zuhause Möwenweg“ ablehnen').click())
    await act(async () => button('Wirklich alle ablehnen?').click())
    expect(api.rejectAllErlebtMitFrom).toHaveBeenCalledWith(8)
    expect(latest.erlebtMitOffen).toBe(0)
  })

  test('neuer Gast: „Passt“ quittiert, „Entfernen“ ist zweistufig', async () => {
    mockLists({ anfragen: [], gaeste: [gast, { ...gast, id: 10, name: 'Zuhause Lindenhof', ueberCode: null }], gruesse: [] })
    api.acknowledgeGuest.mockResolvedValue({ ...home, neueGaeste: 1 })
    api.removeGuest.mockResolvedValue(null)
    await render({ ...home, erlebtMitOffen: 0, neueGaeste: 2, neueGruesse: 0 })
    await openBell()
    await act(async () => button('Passt').click())
    expect(api.acknowledgeGuest).toHaveBeenCalledWith(9)
    expect(latest.neueGaeste).toBe(1)
    act(() => container.querySelector('[aria-label="Zuhause Lindenhof als Gast entfernen"]').click())
    await act(async () => button('Wirklich entfernen?').click())
    expect(api.removeGuest).toHaveBeenCalledWith(10)
    expect(latest.neueGaeste).toBe(0)
  })

  test('Escape schließt, der Fokus geht zurück an die Glocke; die Glocke schließt ein offenes Fenster wieder', async () => {
    mockLists()
    await render()
    await openBell()
    await act(async () => panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(bell())

    await openBell()
    expect(panel()).not.toBeNull()
    // Escape auch, wenn der Fokus gerade nicht im Fenster liegt
    document.body.focus()
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(bell())

    // Die Glocke schließt ein offenes Fenster wieder (kein Zu-und-wieder-Auf über „Klick daneben“)
    await act(async () => bell().click())
    await act(async () => bell().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
    expect(panel()).not.toBeNull()
    await act(async () => bell().click())
    expect(panel()).toBeNull()
  })

  test('ein Gruß führt zur Erinnerung und schließt das Fenster', async () => {
    mockLists({ anfragen: [], gaeste: [], gruesse: [gruss] })
    await render({ ...home, erlebtMitOffen: 0, neueGaeste: 0 })
    await openBell()
    const link = container.querySelector('.hinweis-link')
    link.focus()
    await act(async () => link.click())
    expect(panel()).toBeNull()
    // Der Link führt weg - der Fokus springt nicht zurück an die Glocke
    expect(document.activeElement).not.toBe(bell())
  })

  test('nichts Neues: ruhiger Leerzustand ohne Badge', async () => {
    mockLists({ anfragen: [], gaeste: [], gruesse: [] })
    await render({ ...home, erlebtMitOffen: 0, neueGaeste: 0, neueGruesse: 0 })
    expect(container.querySelector('.hinweis-glocke-badge')).toBeNull()
    await openBell()
    expect(container.textContent).toContain('Alles erledigt – nichts Neues.')
    expect(api.hinweiseGelesen).not.toHaveBeenCalled()
  })

  test('in einer Familie: kein Nachladen, der Weg nach „Mein Zuhause“', async () => {
    await render({ ...home, id: 40, art: 'rudel' })
    await openBell()
    expect(api.erlebtMitOffen).not.toHaveBeenCalled()
    expect(container.textContent).toContain('3 neue Hinweise warten in „Mein Zuhause“.')
    expect(container.querySelector('.hinweis-away a').getAttribute('href')).toBe('/start')
  })

  test('Demo: Knöpfe gesperrt, „gesehen“ nur in dieser Sitzung (kein POST)', async () => {
    mockLists()
    await render({ ...home, isDemo: true })
    await openBell()
    expect(button('Ja').disabled).toBe(true)
    expect(button('Passt').disabled).toBe(true)
    expect(api.hinweiseGelesen).not.toHaveBeenCalled()
    expect(latest.neueGruesse).toBe(0)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
  })

  test('steigt die Zahl, sagt es die Live-Region einmal an - beim ersten Zeigen nicht', async () => {
    await render()
    const status = container.querySelector('[role="status"]')
    expect(status.textContent).toBe('')
    await act(async () => setFamilyFromTest((current) => ({ ...current, erlebtMitOffen: 2 })))
    expect(status.textContent).toBe('4 neue Hinweise')
    // Sinkt die Zahl, wird die Ansage geleert - so ist ein erneuter Anstieg wieder eine neue Ansage
    await act(async () => setFamilyFromTest((current) => ({ ...current, erlebtMitOffen: 1 })))
    expect(status.textContent).toBe('')
    await act(async () => setFamilyFromTest((current) => ({ ...current, erlebtMitOffen: 2 })))
    expect(status.textContent).toBe('4 neue Hinweise')
  })

  test('fragt bei sichtbarem Tab höchstens alle zwei Minuten leise nach', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    api.hinweisGruesse.mockResolvedValue({ gruesse: [], zahlen: { anfragen: 2, gaeste: 1, gruesse: 1 } })
    await render()
    await act(async () => vi.advanceTimersByTime(REFRESH_MS - 1000))
    expect(api.hinweisGruesse).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(1000))
    expect(api.hinweisGruesse).toHaveBeenCalledTimes(1)
    expect(latest.erlebtMitOffen).toBe(2)
    expect(api.erlebtMitOffen).not.toHaveBeenCalled()
  })

  test('„Wir waren hier“-Kontaktwunsch: zählt, steht mit Ort in der Liste, Annehmen fragt erst nach', async () => {
    mockLists({ anfragen: [], gaeste: [], gruesse: [], kontakte: [kontakt] })
    api.wwhKontaktAnnehmen.mockResolvedValue({ id: 7, status: 'angenommen' })
    await render({ ...home, erlebtMitOffen: 0, neueGaeste: 0, neueGruesse: 0, wwhKontakteOffen: 1 })
    expect(bell().getAttribute('aria-label')).toBe('Hinweise, 1 neu')
    await openBell()
    expect(container.querySelector('.hinweis-text').textContent).toBe('Benno möchte Flocke kennenlernen – bei Hundeschule Bachweg')
    expect(container.querySelector('.hinweis-meta a').getAttribute('href')).toBe('/p/hundeschule-bachweg?reiter=wir-waren-hier')
    expect(container.textContent).not.toContain('Zuhause')
    await act(async () => button('Annehmen').click())
    expect(api.wwhKontaktAnnehmen).not.toHaveBeenCalled()
    expect(container.querySelector('dialog').textContent).toContain('nicht privaten Erinnerungen eurer Tiere')
    await act(async () => button('Ja, annehmen').click())
    expect(api.wwhKontaktAnnehmen).toHaveBeenCalledWith(7)
    expect(latest.wwhKontakteOffen).toBe(0)
    expect(container.querySelector('.hinweis-feedback').textContent).toBe('Angenommen – die Familie ist jetzt bei euch zu Besuch.')
  })

  test('Kontaktwunsch ablehnen: sofort, Zahl sinkt', async () => {
    mockLists({ anfragen: [], gaeste: [], gruesse: [], kontakte: [kontakt] })
    api.wwhKontaktAblehnen.mockResolvedValue({ id: 7, status: 'abgelehnt' })
    await render({ ...home, erlebtMitOffen: 0, neueGaeste: 0, neueGruesse: 0, wwhKontakteOffen: 1 })
    await openBell()
    await act(async () => button('Ablehnen').click())
    expect(api.wwhKontaktAblehnen).toHaveBeenCalledWith(7)
    expect(latest.wwhKontakteOffen).toBe(0)
    expect(container.textContent).toContain('Alles erledigt – nichts Neues.')
  })

  test('Kontaktwünsche nicht ladbar: die übrige Glocke bleibt', async () => {
    mockLists({ gaeste: [], gruesse: [] })
    api.wwhKontaktOffen.mockRejectedValue(new Error('weg'))
    await render()
    await openBell()
    expect(container.querySelector('.hinweis-text').textContent).toBe('Wilma war beim „Strandtag“ mit dabei?')
  })

  test('/start?hinweise=offen (Push zum Kontaktwunsch) öffnet die Glocke', async () => {
    mockLists({ anfragen: [], gaeste: [], gruesse: [], kontakte: [kontakt] })
    await render({ ...home, wwhKontakteOffen: 1 }, ['/start?hinweise=offen'])
    expect(bell().getAttribute('aria-expanded')).toBe('true')
    expect(api.wwhKontaktOffen).toHaveBeenCalledTimes(1)
  })
})

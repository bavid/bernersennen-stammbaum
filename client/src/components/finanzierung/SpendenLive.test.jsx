// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { finanzierungLive } = vi.hoisted(() => ({ finanzierungLive: vi.fn() }))
vi.mock('../../api', () => ({ api: { finanzierungLive } }))

import SpendenLive from './SpendenLive.jsx'
import { setLang } from '../../lib/i18n/index.js'

// „Spenden live“: Block mit Monatssumme, Deckung, Aufteilung, Anschub und „Zuletzt gespendet“; Live-Strom (EventSource)
// aktualisiert, die Live-Region sagt nur eine geänderte Monatssumme an; ohne EventSource fragt der Block alle 60 s nach.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const LIVE = {
  summeMonat: 2960,
  summeJahr: 9000,
  summeGesamt: 12000,
  kostenMonat: 4000,
  deckungProzent: 74,
  letzte: [
    {
      betragCents: 2000,
      datum: '',
      erfasst: '',
      name: null,
      nachricht: 'Für die Fellnasen!',
      quelle: 'gofundme'
    }
  ],
  vorleistung: { gesamtCents: 300000, gedecktCents: 40000, offenCents: 260000, kategorien: ['druck'] },
  demo: false,
  stand: '2026-10-10T12:00:00.000Z'
}
const FINANZ = {
  kosten: { proJahrCents: 48000, posten: [{ titel: 'Server', betragCents: 4000, intervall: 'monat', kategorie: 'technik' }] },
  ruecklage: { centsAktuell: 0 }
}

// Eine Spende von vor zwei Stunden (lokales Datum passend).
function frischerEintrag() {
  const erfasst = new Date(Date.now() - 2 * 3600 * 1000)
  const pad = (value) => String(value).padStart(2, '0')
  const datum = `${erfasst.getFullYear()}-${pad(erfasst.getMonth() + 1)}-${pad(erfasst.getDate())}`
  return { ...LIVE.letzte[0], erfasst: erfasst.toISOString(), datum }
}

function live(extra = {}) {
  return { ...LIVE, letzte: [frischerEintrag()], ...extra }
}

class FakeEventSource {
  static last = null
  constructor(url) {
    this.url = url
    this.listeners = {}
    FakeEventSource.last = this
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn
  }
  emit(payload) {
    this.listeners.stand?.({ data: JSON.stringify(payload) })
  }
  close() {
    this.closed = true
  }
}

let container
let root

beforeEach(() => {
  window.EventSource = FakeEventSource
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
  finanzierungLive.mockReset()
  delete window.EventSource
  FakeEventSource.last = null
  vi.useRealTimers()
  setLang('de')
})

async function render(props = { finanz: FINANZ }) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<SpendenLive {...props} />))
}

describe('SpendenLive', () => {
  test('zeigt Monatssumme, Deckung, Kategorien, Anschub und „Zuletzt gespendet“', async () => {
    finanzierungLive.mockResolvedValue(live())
    await render()
    const text = container.textContent
    expect(container.querySelector('h2').textContent).toBe('Spenden live')
    expect(container.querySelector('.spenden-live-summe strong').textContent).toMatch(/^29,60\s€$/)
    expect(text).toContain('Diesen Monat sind 74 % der Kosten gedeckt.')
    expect(text).toContain('Laufende Kosten: Server & Technik')
    expect(text).toMatch(/Anschub \(Druck & Material\): 3\.000,00\s€ – davon gedeckt: 400,00\s€/)
    expect(container.querySelector('.spenden-live-eintrag-kopf').textContent).toMatch(/^Anonym · 20,00\s€ · vor 2 Stunden$/)
    expect(container.querySelector('.spenden-live-nachricht').textContent).toBe('Für die Fellnasen!')
    expect(container.querySelector('[aria-live="polite"]').textContent).toBe('')
    expect(FakeEventSource.last.url).toBe('/api/finanzierung/live/stream')
    expect(text).not.toContain('Beispielzahlen')
  })

  test('Live-Ereignis aktualisiert, die Live-Region sagt nur die geänderte Summe an', async () => {
    finanzierungLive.mockResolvedValue(live())
    await render()
    await act(async () => FakeEventSource.last.emit(live({ stand: 'später' })))
    expect(container.querySelector('[aria-live="polite"]').textContent).toBe('')
    await act(async () => FakeEventSource.last.emit(live({ summeMonat: 4500, deckungProzent: 113 })))
    expect(container.querySelector('[aria-live="polite"]').textContent).toMatch(/^Neuer Stand: 45,00\s€ an Spenden diesen Monat\.$/)
    expect(container.textContent).toContain('Diesen Monat sind die Kosten gedeckt – danke!')
  })

  test('ohne EventSource: Nachfragen alle 60 s; Demo gekennzeichnet', async () => {
    delete window.EventSource
    vi.useFakeTimers()
    finanzierungLive.mockResolvedValue(live({ demo: true }))
    await render()
    expect(container.textContent).toContain('Beispielzahlen')
    expect(finanzierungLive).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTime(60 * 1000))
    expect(finanzierungLive).toHaveBeenCalledTimes(2)
  })

  test('ohne Spenden, Kosten und Anschub oder bei Fehler: nichts', async () => {
    finanzierungLive.mockResolvedValue(live({ summeGesamt: 0, kostenMonat: 0, vorleistung: null }))
    await render()
    expect(container.innerHTML).toBe('')
    act(() => root.unmount())
    root = null
    finanzierungLive.mockRejectedValue(new Error('offline'))
    await render()
    expect(container.innerHTML).toBe('')
  })

  test('Englisch', async () => {
    setLang('en')
    finanzierungLive.mockResolvedValue(live())
    await render()
    expect(container.querySelector('h2').textContent).toBe('Donations live')
    expect(container.textContent).toContain('This month, 74 % of the costs are covered.')
    expect(container.textContent).toContain('Recent donations')
    expect(container.querySelector('.spenden-live-eintrag-kopf').textContent).toMatch(/^Anonymous · .* · 2 hours ago$/)
  })
})
